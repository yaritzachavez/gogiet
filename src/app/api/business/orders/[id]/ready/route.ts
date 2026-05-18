import type { RowDataPacket } from "mysql2/promise";
import { type NextRequest, NextResponse } from "next/server";

import { getAuthUser } from "@/lib/admin-security";
import { recordAuditLog } from "@/lib/audit-log";
import { resolveBusinessAccess } from "@/lib/business-panel";
import pool, { logDbUsage } from "@/lib/db";
import {
  DeliveryAssignmentError,
  requestCourierAssignment,
} from "@/lib/delivery-assignments";
import { createNotificationSafely } from "@/lib/notifications";
import { resolveCanonicalOrderStatus } from "@/lib/order-status";
import {
  applyValidatedOrderStatusTransition,
  OrderStatusTransitionError,
  validateOrderStatusTransition,
} from "@/lib/order-status-guard";
import { ensureCoreOrderStatuses } from "@/lib/order-status-server";

type OrderRow = RowDataPacket & {
  id: number;
  business_id: number;
  business_name: string;
  customer_user_id: number;
  current_status: string | null;
  payment_method: string | null;
  payment_status: string | null;
  driver_user_id: number | null;
};

function canDispatchPaidOrAuthorizedOrder(order: OrderRow) {
  const currentStatus = resolveCanonicalOrderStatus(order.current_status);

  if (
    currentStatus === "preparing" ||
    currentStatus === "ready_for_pickup" ||
    currentStatus === "driver_assigned" ||
    currentStatus === "on_the_way" ||
    currentStatus === "delivered"
  ) {
    return;
  }

  if (
    currentStatus === "pending_payment" ||
    currentStatus === "payment_review" ||
    currentStatus === "payment_failed"
  ) {
    throw new OrderStatusTransitionError(
      "El pedido todavía no tiene un pago validado o autorizado para salir a entrega.",
      409,
    );
  }

  if (currentStatus === "paid" || currentStatus === "accepted") {
    throw new OrderStatusTransitionError(
      "Primero deja el pedido en preparación antes de marcarlo como listo.",
      409,
    );
  }
}

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
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

    const { id } = await context.params;
    const orderId = Number(id);

    console.log("[business-ready] Marcando pedido listo", orderId);

    if (!Number.isInteger(orderId) || orderId <= 0) {
      return NextResponse.json(
        { success: false, error: "Pedido inválido" },
        { status: 400 },
      );
    }

    const [orderRows] = await pool.query<OrderRow[]>(
      `
        SELECT
          o.id,
          o.business_id,
          o.user_id AS customer_user_id,
          b.name AS business_name,
          osc.name AS current_status,
          COALESCE(o.payment_method, pm.name) AS payment_method,
          o.payment_status,
          COALESCE(o.driver_id, d.driver_user_id) AS driver_user_id
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

    if (!orderRows.length) {
      return NextResponse.json(
        { success: false, error: "Pedido no encontrado" },
        { status: 404 },
      );
    }

    const access = await resolveBusinessAccess(
      authUser.user.id,
      Number(orderRows[0].business_id),
    );
    logDbUsage("/api/business/orders/[id]/ready", {
      userId: access.userId,
      email: access.email,
      role: access.roles,
    });

    if (!access.businessIds.includes(Number(orderRows[0].business_id))) {
      return NextResponse.json(
        { success: false, error: "No autorizado para este negocio" },
        { status: 403 },
      );
    }

    canDispatchPaidOrAuthorizedOrder(orderRows[0]);

    const currentStatus = resolveCanonicalOrderStatus(
      orderRows[0].current_status,
    );

    if (currentStatus === "ready_for_pickup") {
      const assignmentResult = await requestCourierAssignment({
        orderId,
        userId: authUser.user.id,
      });

      return NextResponse.json({
        success: true,
        deliveryRequested: assignmentResult.deliveryRequested,
        noActiveCouriers: assignmentResult.noActiveCouriers,
        adminNotified: assignmentResult.adminNotified,
        assignedDeliveryUserId: assignmentResult.courierId,
        message: assignmentResult.message,
      });
    }

    await ensureCoreOrderStatuses(pool);
    const { currentStatus: validatedCurrentStatus } =
      validateOrderStatusTransition({
        currentStatus: orderRows[0].current_status,
        nextStatus: "ready_for_pickup",
        role: "business",
        order: {
          id: orderId,
          businessId: Number(orderRows[0].business_id),
          customerUserId: Number(orderRows[0].customer_user_id),
          driverUserId: Number(orderRows[0].driver_user_id ?? 0) || null,
          paymentMethod: String(orderRows[0].payment_method ?? ""),
          currentStatus: String(orderRows[0].current_status ?? ""),
        },
        actorUserId: authUser.user.id,
      });

    const connection = await pool.getConnection();

    try {
      await connection.beginTransaction();

      await applyValidatedOrderStatusTransition(connection, {
        orderId,
        nextStatus: "ready_for_pickup",
        actorUserId: authUser.user.id,
        actorRole: "business",
        currentStatus: validatedCurrentStatus,
        metadata: {
          endpoint: "/api/business/orders/[id]/ready",
        },
      });

      await createNotificationSafely(
        {
          userId: Number(orderRows[0].customer_user_id),
          type: "pedido",
          title: `Pedido listo #FG-${String(orderId).padStart(4, "0")}`,
          message: `Tu pedido de ${orderRows[0].business_name} ya está listo para entrega.`,
          relatedId: orderId,
          dataJson: {
            order_id: orderId,
            business_id: Number(orderRows[0].business_id),
            status: "ready_for_pickup",
          },
        },
        connection,
      );

      await recordAuditLog(
        {
          userId: authUser.user.id,
          action: "BUSINESS_MARK_ORDER_READY",
          resourceType: "order",
          resourceId: orderId,
          oldValue: {
            status: validatedCurrentStatus,
            payment_method: orderRows[0].payment_method,
            payment_status: orderRows[0].payment_status,
          },
          newValue: {
            status: "ready_for_pickup",
          },
          ip: req.headers.get("x-forwarded-for"),
          userAgent: req.headers.get("user-agent"),
        },
        connection,
      );

      await connection.commit();
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }

    const assignmentResult = await requestCourierAssignment({
      orderId,
      userId: authUser.user.id,
    });

    return NextResponse.json({
      success: true,
      deliveryRequested: assignmentResult.deliveryRequested,
      noActiveCouriers: assignmentResult.noActiveCouriers,
      adminNotified: assignmentResult.adminNotified,
      assignedDeliveryUserId: assignmentResult.courierId,
      message: assignmentResult.message,
    });
  } catch (error) {
    console.error("[business-ready] Error real backend", error);
    if (error instanceof DeliveryAssignmentError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.status },
      );
    }
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
            : "No se pudo marcar el pedido como listo.",
      },
      { status: 500 },
    );
  }
}
