import type {
  PoolConnection,
  ResultSetHeader,
  RowDataPacket,
} from "mysql2/promise";
import { type NextRequest, NextResponse } from "next/server";

import { getAuthUser } from "@/lib/admin-security";
import { recordAuditLog } from "@/lib/audit-log";
import { ensureDeliveryStatus } from "@/lib/business-panel";
import pool from "@/lib/db";
import { resolveDeliveryAccess } from "@/lib/delivery-access";
import {
  COURIER_EARNING_RATE,
  DEFAULT_DELIVERY_FEE_RATE,
  getExistingColumns,
  getShippingFeeSqlExpression,
  pickFirstExistingColumn,
  SHIPPING_FEE_COLUMN_CANDIDATES,
} from "@/lib/delivery-fees";
import { saveDriverEarning } from "@/lib/driver-earnings";
import { createNotificationsForUsersSafely } from "@/lib/notifications";
import { resolveCanonicalOrderStatus } from "@/lib/order-status";
import {
  applyValidatedOrderStatusTransition,
  OrderStatusTransitionError,
  validateOrderStatusTransition,
} from "@/lib/order-status-guard";

type AssignedOrderRow = RowDataPacket & {
  delivery_id: number;
  order_id: number;
  business_id: number;
  customer_user_id: number;
  business_name: string;
  payment_method: string | null;
  current_status: string | null;
  driver_user_id: number;
  order_delivered_at: string | null;
  delivery_delivered_at: string | null;
  shipping_fee_amount: string | number | null;
};

type BusinessUserRow = RowDataPacket & {
  user_id: number;
};

function normalizeStatus(value: unknown) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, "_");
}

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

    if (
      ![
        "to_business",
        "en_camino_negocio",
        "arrived_business",
        "llegue_al_negocio",
        "recogido",
        "on_the_way",
        "en_camino",
        "delivered",
        "entregado",
        "incident",
        "incidencia",
      ].includes(requestedStatus)
    ) {
      return NextResponse.json(
        { success: false, error: "Estado de entrega inválido" },
        { status: 400 },
      );
    }

    const deliveryAccess = await resolveDeliveryAccess(authUser.user.id);
    if (!deliveryAccess.allowed) {
      return NextResponse.json(
        { success: false, error: "No autorizado para operar entregas." },
        { status: 403 },
      );
    }

    if (
      deliveryAccess.operationalStatus === "SUSPENDED" ||
      deliveryAccess.operationalStatus === "DISABLED"
    ) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Tu estado operativo requiere revisión del administrador general.",
          operationalStatus: deliveryAccess.operationalStatus,
        },
        { status: 403 },
      );
    }

    const deliveryColumns = await getExistingColumns(connection, "delivery", [
      "completed_at",
      "driver_earning",
      "to_business_at",
      "arrived_business_at",
      "incident_at",
      "incident_reason",
    ]);
    const orderColumns = await getExistingColumns(
      connection,
      "orders",
      SHIPPING_FEE_COLUMN_CANDIDATES,
    );
    const hasCompletedAt = deliveryColumns.has("completed_at");
    const hasDriverEarning = deliveryColumns.has("driver_earning");
    const hasToBusinessAt = deliveryColumns.has("to_business_at");
    const hasArrivedBusinessAt = deliveryColumns.has("arrived_business_at");
    const hasIncidentAt = deliveryColumns.has("incident_at");
    const hasIncidentReason = deliveryColumns.has("incident_reason");
    const shippingFeeColumn = pickFirstExistingColumn(
      orderColumns,
      SHIPPING_FEE_COLUMN_CANDIDATES,
    );
    const shippingFeeExpression =
      getShippingFeeSqlExpression(shippingFeeColumn);

    const [rows] = await connection.query<AssignedOrderRow[]>(
      `
        SELECT
          d.id AS delivery_id,
          o.id AS order_id,
          o.business_id,
          b.name AS business_name,
          o.user_id AS customer_user_id,
          COALESCE(o.payment_method, pm.name) AS payment_method,
          osc.name AS current_status,
          d.driver_user_id,
          o.delivered_at AS order_delivered_at,
          d.delivered_at AS delivery_delivered_at,
          ${shippingFeeExpression} AS shipping_fee_amount
        FROM orders o
        INNER JOIN business b ON b.id = o.business_id
        LEFT JOIN payment_methods pm ON pm.id = o.payment_method_id
        LEFT JOIN order_status_catalog osc ON osc.id = o.order_status_id
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

    if (order.order_delivered_at || order.delivery_delivered_at) {
      return NextResponse.json(
        { success: false, error: "La entrega ya fue completada" },
        { status: 409 },
      );
    }

    const nextAuditStatus =
      requestedStatus === "recogido"
        ? "recogido"
        : requestedStatus === "to_business" ||
            requestedStatus === "en_camino_negocio"
          ? "en_camino_negocio"
          : requestedStatus === "arrived_business" ||
              requestedStatus === "llegue_al_negocio"
            ? "llegue_al_negocio"
            : requestedStatus === "incident" || requestedStatus === "incidencia"
              ? "incidencia"
              : requestedStatus === "delivered" ||
                  requestedStatus === "entregado"
                ? "delivered"
                : "en_camino";

    await connection.beginTransaction();

    if (
      requestedStatus === "to_business" ||
      requestedStatus === "en_camino_negocio"
    ) {
      const deliveryStatusId = await ensureDeliveryStatus(
        "en_camino_negocio",
        "Repartidor en camino al negocio",
        3,
        false,
        connection,
      );

      await connection.query<ResultSetHeader>(
        `
          UPDATE delivery
          SET
            delivery_status_id = ?,
            ${hasToBusinessAt ? "to_business_at = COALESCE(to_business_at, NOW())," : ""}
            updated_at = NOW()
          WHERE order_id = ?
        `,
        [deliveryStatusId, orderId],
      );
    } else if (
      requestedStatus === "arrived_business" ||
      requestedStatus === "llegue_al_negocio"
    ) {
      const deliveryStatusId = await ensureDeliveryStatus(
        "llegue_al_negocio",
        "Repartidor llegó al negocio",
        4,
        false,
        connection,
      );

      await connection.query<ResultSetHeader>(
        `
          UPDATE delivery
          SET
            delivery_status_id = ?,
            ${hasToBusinessAt ? "to_business_at = COALESCE(to_business_at, NOW())," : ""}
            ${hasArrivedBusinessAt ? "arrived_business_at = COALESCE(arrived_business_at, NOW())," : ""}
            updated_at = NOW()
          WHERE order_id = ?
        `,
        [deliveryStatusId, orderId],
      );
    } else if (
      requestedStatus === "incident" ||
      requestedStatus === "incidencia"
    ) {
      const deliveryStatusId = await ensureDeliveryStatus(
        "incidencia",
        "Incidencia reportada por el repartidor",
        97,
        false,
        connection,
      );

      await connection.query<ResultSetHeader>(
        `
          UPDATE delivery
          SET
            delivery_status_id = ?,
            ${hasIncidentAt ? "incident_at = COALESCE(incident_at, NOW())," : ""}
            ${hasIncidentReason ? "incident_reason = ?," : ""}
            updated_at = NOW()
          WHERE order_id = ?
        `,
        hasIncidentReason
          ? [
              deliveryStatusId,
              "Incidencia reportada desde panel delivery",
              orderId,
            ]
          : [deliveryStatusId, orderId],
      );
    } else if (
      requestedStatus === "delivered" ||
      requestedStatus === "entregado"
    ) {
      const currentStatus = resolveCanonicalOrderStatus(order.current_status);
      const allowedDirectDeliveryStatuses = new Set([
        "pending",
        "accepted",
        "preparing",
        "ready_for_pickup",
        "delivery_requested",
        "driver_assigned",
        "on_the_way",
      ]);

      if (!allowedDirectDeliveryStatuses.has(currentStatus)) {
        await connection.rollback();
        return NextResponse.json(
          {
            success: false,
            error:
              "Este pedido todavía no puede marcarse como entregado desde repartidor.",
          },
          { status: 409 },
        );
      }

      const deliveryStatusId = await ensureDeliveryStatus(
        "completado",
        "Entrega completada por el repartidor",
        99,
        true,
        connection,
      );
      const shippingFeeAmount = Number(order.shipping_fee_amount ?? 0);
      const driverEarning = shippingFeeAmount * COURIER_EARNING_RATE;
      const platformFee = shippingFeeAmount - driverEarning;

      await applyValidatedOrderStatusTransition(connection, {
        orderId,
        nextStatus: "delivered",
        actorUserId: authUser.user.id,
        actorRole: "driver",
        currentStatus,
        metadata: {
          endpoint: "/api/delivery/orders/[orderId]/status",
          driver_action: "delivered",
          directDeliveryButton: true,
        },
      });

      await connection.query<ResultSetHeader>(
        `
          UPDATE delivery
          SET
            delivery_status_id = ?,
            picked_up_at = COALESCE(picked_up_at, NOW()),
            in_route_at = COALESCE(in_route_at, NOW()),
            delivered_at = COALESCE(delivered_at, NOW()),
            ${hasCompletedAt ? "completed_at = COALESCE(completed_at, NOW())," : ""}
            ${hasDriverEarning ? "driver_earning = ?," : ""}
            updated_at = NOW()
          WHERE order_id = ?
        `,
        hasDriverEarning
          ? [deliveryStatusId, Number(driverEarning.toFixed(2)), orderId]
          : [deliveryStatusId, orderId],
      );

      await saveDriverEarning(
        {
          deliveryId: Number(order.delivery_id),
          orderId,
          driverUserId: authUser.user.id,
          deliveryFee: shippingFeeAmount,
          driverFee: driverEarning,
          platformFee,
          earningStatus: "pending",
        },
        connection,
      );

      const businessUserIds = await getBusinessUserIds(
        connection,
        Number(order.business_id),
      );

      await createNotificationsForUsersSafely(
        [...businessUserIds, Number(order.customer_user_id)],
        {
          type: "pedido",
          title: `Pedido entregado #FG-${String(orderId).padStart(4, "0")}`,
          message: `El pedido de ${order.business_name} fue marcado como entregado.`,
          relatedId: orderId,
        },
        connection,
      );

      console.log("[delivery-status] pedido entregado:", {
        orderId,
        deliveryId: Number(order.delivery_id),
        driverUserId: authUser.user.id,
        previousOrderStatus: order.current_status,
        nextOrderStatus: "delivered",
        deliveredAt: new Date().toISOString(),
        shippingFeeAmount,
        driverEarning: Number(driverEarning.toFixed(2)),
        platformFee: Number(platformFee.toFixed(2)),
        fallbackRate: DEFAULT_DELIVERY_FEE_RATE,
      });
    } else if (requestedStatus === "recogido") {
      const deliveryStatusId = await ensureDeliveryStatus(
        "recogido",
        "Pedido recogido por el repartidor",
        4,
        false,
        connection,
      );
      const { currentStatus } = validateOrderStatusTransition({
        currentStatus: order.current_status,
        nextStatus: "on_the_way",
        role: "driver",
        order: {
          id: orderId,
          businessId: Number(order.business_id),
          customerUserId: Number(order.customer_user_id),
          driverUserId: Number(order.driver_user_id),
          paymentMethod: String(order.payment_method ?? ""),
          currentStatus: String(order.current_status ?? ""),
        },
        actorUserId: authUser.user.id,
      });

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
            updated_at = NOW()
          WHERE id = ?
        `,
        [authUser.user.id, orderId],
      );

      await applyValidatedOrderStatusTransition(connection, {
        orderId,
        nextStatus: "on_the_way",
        actorUserId: authUser.user.id,
        actorRole: "driver",
        currentStatus,
        metadata: {
          endpoint: "/api/delivery/orders/[orderId]/status",
          driver_action: "picked_up",
        },
      });
    } else {
      const deliveryStatusId = await ensureDeliveryStatus(
        "en_camino",
        "Pedido en camino al cliente",
        5,
        false,
        connection,
      );
      const { currentStatus } = validateOrderStatusTransition({
        currentStatus: order.current_status,
        nextStatus: "on_the_way",
        role: "driver",
        order: {
          id: orderId,
          businessId: Number(order.business_id),
          customerUserId: Number(order.customer_user_id),
          driverUserId: Number(order.driver_user_id),
          paymentMethod: String(order.payment_method ?? ""),
          currentStatus: String(order.current_status ?? ""),
        },
        actorUserId: authUser.user.id,
      });

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
            updated_at = NOW()
          WHERE id = ?
        `,
        [authUser.user.id, orderId],
      );

      await applyValidatedOrderStatusTransition(connection, {
        orderId,
        nextStatus: "on_the_way",
        actorUserId: authUser.user.id,
        actorRole: "driver",
        currentStatus,
        metadata: {
          endpoint: "/api/delivery/orders/[orderId]/status",
          driver_action: "on_the_way",
        },
      });
    }

    await recordAuditLog(
      {
        userId: authUser.user.id,
        action:
          requestedStatus === "recogido"
            ? "DRIVER_PICKUP_ORDER"
            : requestedStatus === "delivered" || requestedStatus === "entregado"
              ? "DRIVER_MARK_DELIVERED"
              : "DRIVER_MARK_ON_THE_WAY",
        resourceType: "order",
        resourceId: orderId,
        oldValue: {
          status: order.current_status,
        },
        newValue: {
          status: nextAuditStatus,
        },
        ip:
          req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
          req.headers.get("x-real-ip"),
        userAgent: req.headers.get("user-agent"),
      },
      connection,
    );

    await connection.commit();

    return NextResponse.json({
      success: true,
      orderId,
      status:
        requestedStatus === "recogido"
          ? "recogido"
          : requestedStatus === "delivered" || requestedStatus === "entregado"
            ? "delivered"
            : "on_the_way",
      message:
        requestedStatus === "recogido"
          ? "Pedido marcado como recogido"
          : requestedStatus === "delivered" || requestedStatus === "entregado"
            ? "Pedido entregado correctamente"
            : "Pedido marcado en camino",
    });
  } catch (error) {
    await connection.rollback();
    console.error("Error PATCH /api/delivery/orders/[orderId]/status:", error);
    if (error instanceof OrderStatusTransitionError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.statusCode },
      );
    }
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
