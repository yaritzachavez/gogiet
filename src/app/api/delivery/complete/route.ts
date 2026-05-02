import type {
  PoolConnection,
  ResultSetHeader,
  RowDataPacket,
} from "mysql2/promise";
import { type NextRequest, NextResponse } from "next/server";

import { getAuthUser } from "@/lib/admin-security";
import { ensureDeliveryStatus, ensureOrderStatus } from "@/lib/business-panel";
import pool from "@/lib/db";
import {
  COURIER_EARNING_RATE,
  DEFAULT_DELIVERY_FEE_RATE,
  getExistingColumns,
  getShippingFeeSourceLabel,
  getShippingFeeSqlExpression,
  pickFirstExistingColumn,
  SHIPPING_FEE_COLUMN_CANDIDATES,
} from "@/lib/delivery-fees";
import { createNotificationsForUsers } from "@/lib/notifications";

type AssignedOrderRow = RowDataPacket & {
  order_id: number;
  business_id: number;
  customer_user_id: number;
  business_name: string;
  driver_user_id: number;
  order_delivered_at: string | null;
  delivery_delivered_at: string | null;
  shipping_fee_amount: string | number | null;
};

type BusinessUserRow = RowDataPacket & {
  user_id: number;
};

async function getBusinessUserIds(
  connection: PoolConnection,
  businessId: number,
) {
  const [rows] = await connection.query<BusinessUserRow[]>(
    `
      SELECT DISTINCT user_id
      FROM (
        SELECT bo.user_id
        FROM business_owners bo
        WHERE bo.business_id = ?

        UNION

        SELECT bm.user_id
        FROM business_managers bm
        WHERE bm.business_id = ? AND COALESCE(bm.is_active, 1) = 1
      ) business_team
    `,
    [businessId, businessId],
  );

  return rows
    .map((row) => Number(row.user_id))
    .filter((userId) => Number.isInteger(userId) && userId > 0);
}

export async function POST(req: NextRequest) {
  const connection = await pool.getConnection();

  try {
    const authUser = getAuthUser(req);

    if (!authUser?.token) {
      return NextResponse.json(
        { success: false, error: "Token faltante" },
        { status: 401 },
      );
    }

    if (!authUser?.user) {
      return NextResponse.json(
        { success: false, error: "Token inválido" },
        { status: 401 },
      );
    }

    const body = await req.json().catch(() => null);
    const orderId = Number(body?.order_id);

    if (!Number.isInteger(orderId) || orderId <= 0) {
      return NextResponse.json(
        { success: false, error: "order_id es obligatorio y debe ser válido" },
        { status: 400 },
      );
    }

    await connection.beginTransaction();

    const deliveryColumns = await getExistingColumns(connection, "delivery", [
      "completed_at",
      "driver_earning",
    ]);
    const orderColumns = await getExistingColumns(
      connection,
      "orders",
      SHIPPING_FEE_COLUMN_CANDIDATES,
    );
    const hasCompletedAt = deliveryColumns.has("completed_at");
    const hasDriverEarning = deliveryColumns.has("driver_earning");
    const shippingFeeColumn = pickFirstExistingColumn(
      orderColumns,
      SHIPPING_FEE_COLUMN_CANDIDATES,
    );

    const shippingFeeExpression =
      getShippingFeeSqlExpression(shippingFeeColumn);
    const shippingFeeSource = getShippingFeeSourceLabel(shippingFeeColumn);

    const [rows] = await connection.query<AssignedOrderRow[]>(
      `
        SELECT
          o.id AS order_id,
          o.business_id,
          o.user_id AS customer_user_id,
          b.name AS business_name,
          d.driver_user_id,
          o.delivered_at AS order_delivered_at,
          d.delivered_at AS delivery_delivered_at,
          ${shippingFeeExpression} AS shipping_fee_amount
        FROM orders o
        INNER JOIN delivery d ON d.order_id = o.id
        INNER JOIN business b ON b.id = o.business_id
        WHERE o.id = ?
        LIMIT 1
      `,
      [orderId],
    );

    if (!rows.length) {
      await connection.rollback();
      return NextResponse.json(
        { success: false, error: "Pedido no encontrado o sin asignación" },
        { status: 404 },
      );
    }

    const order = rows[0];

    if (Number(order.driver_user_id) !== authUser.user.id) {
      await connection.rollback();
      return NextResponse.json(
        { success: false, error: "Este pedido no está asignado a tu cuenta" },
        { status: 403 },
      );
    }

    if (order.order_delivered_at || order.delivery_delivered_at) {
      await connection.rollback();
      return NextResponse.json(
        { success: false, error: "El pedido ya fue marcado como entregado" },
        { status: 409 },
      );
    }

    const shippingFeeAmount = Number(order.shipping_fee_amount ?? 0);
    const driverEarning = shippingFeeAmount * COURIER_EARNING_RATE;

    console.log("[delivery-complete] pedido entregado:", {
      orderId,
      driverUserId: authUser.user.id,
      columnaDetectada: shippingFeeColumn,
      fuenteEnvio: shippingFeeSource,
      shippingFeeAmount,
      driverEarning: Number(driverEarning.toFixed(2)),
      fallbackRate: DEFAULT_DELIVERY_FEE_RATE,
    });

    const orderStatusId = await ensureOrderStatus(
      "pedido_entregado",
      "Pedido entregado al cliente",
      99,
      true,
      connection,
    );
    const deliveryStatusId = await ensureDeliveryStatus(
      "completado",
      "Entrega completada por el repartidor",
      99,
      true,
      connection,
    );

    await connection.query<ResultSetHeader>(
      `
        UPDATE orders
        SET
          order_status_id = ?,
          delivered_at = NOW(),
          updated_at = NOW()
        WHERE id = ?
      `,
      [orderStatusId, orderId],
    );

    await connection.query<ResultSetHeader>(
      `
        UPDATE delivery
        SET
          delivery_status_id = ?,
          delivered_at = NOW(),
          ${hasCompletedAt ? "completed_at = NOW()," : ""}
          ${hasDriverEarning ? "driver_earning = ?," : ""}
          updated_at = NOW()
        WHERE order_id = ?
      `,
      hasDriverEarning
        ? [deliveryStatusId, Number(driverEarning.toFixed(2)), orderId]
        : [deliveryStatusId, orderId],
    );

    const businessUserIds = await getBusinessUserIds(
      connection,
      Number(order.business_id),
    );

    await createNotificationsForUsers(
      [...businessUserIds, Number(order.customer_user_id)],
      {
        type: "pedido",
        title: `Pedido entregado #FG-${String(orderId).padStart(4, "0")}`,
        message: `El pedido de ${order.business_name} fue marcado como entregado.`,
        relatedId: orderId,
      },
      connection,
    );

    await connection.commit();

    return NextResponse.json({
      success: true,
      message: "Pedido marcado como entregado",
    });
  } catch (error) {
    await connection.rollback();
    console.error("Error POST /api/delivery/complete:", error);

    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "No se pudo marcar el pedido como entregado",
      },
      { status: 500 },
    );
  } finally {
    connection.release();
  }
}
