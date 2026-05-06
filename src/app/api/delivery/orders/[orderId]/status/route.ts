import type { ResultSetHeader, RowDataPacket } from "mysql2/promise";
import { type NextRequest, NextResponse } from "next/server";

import { getAuthUser } from "@/lib/admin-security";
import { ensureDeliveryStatus } from "@/lib/business-panel";
import pool from "@/lib/db";
import { ensureCanonicalOrderStatus } from "@/lib/order-status-server";

type AssignedOrderRow = RowDataPacket & {
  order_id: number;
  driver_user_id: number;
  delivery_delivered_at: string | null;
};

function normalizeStatus(value: unknown) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, "_");
}

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ orderId: string }> },
) {
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
    const requestedStatus = normalizeStatus(body?.status);
    const { orderId: rawOrderId } = await context.params;
    const orderId = Number(rawOrderId);

    if (!Number.isInteger(orderId) || orderId <= 0) {
      return NextResponse.json(
        { success: false, error: "Pedido inválido" },
        { status: 400 },
      );
    }

    if (!["recogido", "on_the_way", "en_camino"].includes(requestedStatus)) {
      return NextResponse.json(
        { success: false, error: "Estado de entrega inválido" },
        { status: 400 },
      );
    }

    const [rows] = await connection.query<AssignedOrderRow[]>(
      `
        SELECT
          o.id AS order_id,
          d.driver_user_id,
          d.delivered_at AS delivery_delivered_at
        FROM orders o
        INNER JOIN delivery d ON d.order_id = o.id
        WHERE o.id = ?
        LIMIT 1
      `,
      [orderId],
    );

    if (!rows.length) {
      return NextResponse.json(
        { success: false, error: "Pedido no encontrado o sin asignación" },
        { status: 404 },
      );
    }

    const order = rows[0];

    if (Number(order.driver_user_id) !== authUser.user.id) {
      return NextResponse.json(
        { success: false, error: "Este pedido no está asignado a tu cuenta" },
        { status: 403 },
      );
    }

    if (order.delivery_delivered_at) {
      return NextResponse.json(
        { success: false, error: "La entrega ya fue completada" },
        { status: 409 },
      );
    }

    await connection.beginTransaction();

    if (requestedStatus === "recogido") {
      const deliveryStatusId = await ensureDeliveryStatus(
        "recogido",
        "Pedido recogido por el repartidor",
        4,
        false,
        connection,
      );
      const { statusId: orderStatusId } = await ensureCanonicalOrderStatus(
        "driver_assigned",
        connection,
      );

      await connection.query<ResultSetHeader>(
        `
          UPDATE delivery
          SET
            delivery_status_id = ?,
            picked_up_at = COALESCE(picked_up_at, NOW()),
            updated_at = NOW()
          WHERE order_id = ?
        `,
        [deliveryStatusId, orderId],
      );

      await connection.query<ResultSetHeader>(
        `
          UPDATE orders
          SET
            driver_id = COALESCE(driver_id, ?),
            order_status_id = ?,
            updated_at = NOW()
          WHERE id = ?
        `,
        [authUser.user.id, orderStatusId, orderId],
      );
    } else {
      const deliveryStatusId = await ensureDeliveryStatus(
        "en_camino",
        "Pedido en camino al cliente",
        5,
        false,
        connection,
      );
      const { statusId: orderStatusId } = await ensureCanonicalOrderStatus(
        "on_the_way",
        connection,
      );

      await connection.query<ResultSetHeader>(
        `
          UPDATE delivery
          SET
            delivery_status_id = ?,
            picked_up_at = COALESCE(picked_up_at, NOW()),
            in_route_at = COALESCE(in_route_at, NOW()),
            updated_at = NOW()
          WHERE order_id = ?
        `,
        [deliveryStatusId, orderId],
      );

      await connection.query<ResultSetHeader>(
        `
          UPDATE orders
          SET
            driver_id = COALESCE(driver_id, ?),
            order_status_id = ?,
            updated_at = NOW()
          WHERE id = ?
        `,
        [authUser.user.id, orderStatusId, orderId],
      );
    }

    await connection.commit();

    return NextResponse.json({
      success: true,
      orderId,
      status: requestedStatus === "recogido" ? "recogido" : "on_the_way",
      message:
        requestedStatus === "recogido"
          ? "Pedido marcado como recogido"
          : "Pedido marcado en camino",
    });
  } catch (error) {
    await connection.rollback();
    console.error("Error PATCH /api/delivery/orders/[orderId]/status:", error);
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "No se pudo actualizar la entrega.",
      },
      { status: 500 },
    );
  } finally {
    connection.release();
  }
}
