import type { ResultSetHeader, RowDataPacket } from "mysql2/promise";
import { type NextRequest, NextResponse } from "next/server";

import { getAuthUser, isAdminGeneral } from "@/lib/admin-security";
import { resolveBusinessAccess } from "@/lib/business-panel";
import pool from "@/lib/db";
import { createNotification } from "@/lib/notifications";
import {
  type CanonicalOrderStatus,
  getOrderStatusLabel,
  resolveCanonicalOrderStatus,
} from "@/lib/order-status";
import {
  applyValidatedOrderStatusTransition,
  type GuardedOrderRow,
  type OrderActorRole,
  OrderStatusTransitionError,
  validateOrderStatusTransition,
} from "@/lib/order-status-guard";
import {
  ensureCoreOrderStatuses,
} from "@/lib/order-status-server";

type OrderRow = RowDataPacket &
  GuardedOrderRow & {
  id: number;
  business_name: string;
};

function getStatusNotificationCopy(
  status: CanonicalOrderStatus,
  orderId: number,
  businessName: string,
) {
  const folio = `#FG-${String(orderId).padStart(4, "0")}`;

  switch (status) {
    case "accepted":
      return {
        title: `Pedido aceptado ${folio}`,
        message: `${businessName} aceptó tu pedido y pronto comenzará a prepararlo.`,
      };
    case "preparing":
      return {
        title: `Pedido en preparación ${folio}`,
        message: `${businessName} ya está preparando tu pedido.`,
      };
    case "ready_for_pickup":
      return {
        title: `Pedido listo ${folio}`,
        message: `Tu pedido de ${businessName} ya está listo para salir a entrega.`,
      };
    case "delivered":
      return {
        title: `Pedido entregado ${folio}`,
        message: `Tu pedido de ${businessName} fue marcado como entregado.`,
      };
    default:
      return null;
  }
}

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const connection = await pool.getConnection();

  try {
    const auth = getAuthUser(req);

    if (!auth?.token) {
      return NextResponse.json(
        { success: false, error: "Token faltante" },
        { status: 401 },
      );
    }

    if (!auth?.user) {
      return NextResponse.json(
        { success: false, error: "Token inválido" },
        { status: 401 },
      );
    }

    const { id } = await context.params;
    const orderId = Number(id);
    const body = await req.json().catch(() => null);
    const requestedStatus = resolveCanonicalOrderStatus(
      body?.nextStatus ?? body?.status,
    );
    const reason = String(body?.reason ?? "").trim();

    if (!Number.isInteger(orderId) || orderId <= 0) {
      return NextResponse.json(
        { success: false, error: "Pedido inválido" },
        { status: 400 },
      );
    }

    await ensureCoreOrderStatuses(connection);

    const [orderRows] = await connection.query<OrderRow[]>(
      `
        SELECT
          o.id,
          o.business_id AS businessId,
          b.name AS business_name,
          o.user_id AS customerUserId,
          COALESCE(o.payment_method, pm.name) AS paymentMethod,
          osc.name AS currentStatus,
          COALESCE(o.driver_id, d.driver_user_id) AS driverUserId
        FROM orders o
        INNER JOIN business b ON b.id = o.business_id
        LEFT JOIN order_status_catalog osc ON osc.id = o.order_status_id
        LEFT JOIN payment_methods pm ON pm.id = o.payment_method_id
        LEFT JOIN delivery d ON d.order_id = o.id
        WHERE o.id = ?
        LIMIT 1
      `,
      [orderId],
    );

    const order = orderRows[0];

    if (!order) {
      return NextResponse.json(
        { success: false, error: "Pedido no encontrado" },
        { status: 404 },
      );
    }

    const admin = await isAdminGeneral(auth.user.id);
    const businessAccess = await resolveBusinessAccess(
      auth.user.id,
      Number(order.businessId),
    );
    const isBusinessActor = businessAccess.businessIds.includes(Number(order.businessId));
    const isAssignedDriver = Number(order.driverUserId ?? 0) === auth.user.id;
    const isCustomer = Number(order.customerUserId) === auth.user.id;

    let actorRole: OrderActorRole | null = null;

    if (admin) actorRole = "admin";
    else if (isBusinessActor) actorRole = "business";
    else if (isAssignedDriver) actorRole = "driver";
    else if (isCustomer) actorRole = "client";

    if (!actorRole) {
      return NextResponse.json(
        {
          success: false,
          error: "No autorizado para cambiar este pedido",
        },
        { status: 403 },
      );
    }

    const { currentStatus, nextStatus, changedByRole } =
      validateOrderStatusTransition({
        currentStatus: order.currentStatus,
        nextStatus: requestedStatus,
        role: actorRole,
        order,
        actorUserId: auth.user.id,
        reason,
      });

    await connection.beginTransaction();

    await applyValidatedOrderStatusTransition(connection, {
      orderId,
      nextStatus,
      actorUserId: auth.user.id,
      actorRole: changedByRole,
      currentStatus,
      reason,
      metadata: {
        endpoint: "/api/orders/[id]/status",
      },
    });

    const canonical = resolveCanonicalOrderStatus(
      requestedStatus,
    );
    const notificationCopy =
      currentStatus !== canonical
        ? getStatusNotificationCopy(
          canonical,
            orderId,
            String(order.business_name ?? "tu negocio"),
          )
        : null;

    if (notificationCopy) {
      await createNotification(
        {
          userId: Number(order.customerUserId),
          type: "pedido",
          title: notificationCopy.title,
          message: notificationCopy.message,
          relatedId: orderId,
          dataJson: {
            order_id: orderId,
            business_id: Number(order.businessId),
            status: canonical,
            previous_status: currentStatus,
          },
        },
        connection,
      );
    }

    await connection.commit();

    return NextResponse.json({
      success: true,
      orderId,
      status: canonical,
      statusLabel: getOrderStatusLabel(canonical),
      previousStatus: currentStatus,
    });
  } catch (error) {
    await connection.rollback();
    console.error("Error PATCH /api/orders/[id]/status:", error);
    if (error instanceof OrderStatusTransitionError) {
      return NextResponse.json(
        {
          success: false,
          error: error.message,
        },
        { status: error.statusCode },
      );
    }
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "No se pudo actualizar el estado del pedido.",
      },
      { status: 500 },
    );
  } finally {
    connection.release();
  }
}
