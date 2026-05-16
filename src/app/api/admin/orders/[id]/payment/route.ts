import type { RowDataPacket } from "mysql2/promise";
import { type NextRequest, NextResponse } from "next/server";

import { recordAuditLog } from "@/lib/audit-log";
import pool from "@/lib/db";
import { createNotificationForBusiness } from "@/lib/notifications";
import { resolveCanonicalOrderStatus } from "@/lib/order-status";
import {
  applyValidatedOrderStatusTransition,
  OrderStatusTransitionError,
  validateOrderStatusTransition,
} from "@/lib/order-status-guard";
import { requirePermission } from "@/lib/permissions";
import { addSupportMessage, getOrCreateSupportThread } from "@/lib/support";

function normalizeCatalogName(value: unknown, fallback: string) {
  const normalized = String(value ?? "")
    .trim()
    .toLowerCase();

  return normalized || fallback;
}

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const access = await requirePermission(
      req,
      "VALIDATE_PAYMENT",
      undefined,
      "No tienes permiso para validar pagos.",
    );
    if (!access.ok) return access.response;

    const { id } = await context.params;
    const orderId = Number(id);

    if (!Number.isInteger(orderId) || orderId <= 0) {
      return NextResponse.json({ error: "ID inválido" }, { status: 400 });
    }

    const body = await req.json();
    const action = String(body?.action ?? "")
      .trim()
      .toLowerCase();
    const reason = String(body?.reason ?? "").trim();
    if (action !== "approve" && action !== "reject") {
      return NextResponse.json({ error: "Acción inválida" }, { status: 400 });
    }

    if (action === "reject" && !reason) {
      return NextResponse.json(
        { error: "Debes indicar un motivo de rechazo" },
        { status: 400 },
      );
    }

    const [rows] = await pool.query<RowDataPacket[]>(
      `
        SELECT
          o.id,
          o.user_id,
          o.business_id,
          COALESCE(o.payment_method, pm.name) AS payment_method,
          osc.name AS status_name
        FROM orders o
        LEFT JOIN payment_methods pm ON pm.id = o.payment_method_id
        LEFT JOIN order_status_catalog osc ON osc.id = o.order_status_id
        WHERE o.id = ?
        LIMIT 1
      `,
      [orderId],
    );

    const order = rows[0];

    if (!order) {
      return NextResponse.json(
        { error: "Pedido no encontrado" },
        { status: 404 },
      );
    }

    if (normalizeCatalogName(order.payment_method, "") !== "transferencia") {
      return NextResponse.json(
        { error: "Solo se pueden validar pagos por transferencia" },
        { status: 400 },
      );
    }

    if (resolveCanonicalOrderStatus(order.status_name) !== "payment_review") {
      return NextResponse.json(
        { error: "Este pedido ya no está pendiente de validación" },
        { status: 400 },
      );
    }

    const nextStatus = action === "approve" ? "paid" : "cancelled";

    const connection = await pool.getConnection();

    try {
      await connection.beginTransaction();

      const { currentStatus } = validateOrderStatusTransition({
        currentStatus: order.status_name,
        nextStatus,
        role: "admin",
        order: {
          id: orderId,
          businessId: Number(order.business_id),
          customerUserId: Number(order.user_id),
          driverUserId: null,
          paymentMethod: String(order.payment_method ?? ""),
          currentStatus: String(order.status_name ?? ""),
        },
        actorUserId: access.access.userId,
        reason,
      });

      await applyValidatedOrderStatusTransition(connection, {
        orderId,
        nextStatus,
        actorUserId: access.access.userId,
        actorRole: "admin",
        currentStatus,
        reason,
        metadata: {
          endpoint: "/api/admin/orders/[id]/payment",
          action,
          payment_method: "transferencia",
        },
      });

      const adminMessage =
        action === "approve"
          ? "ADMIN_GENERAL validó correctamente el pago por transferencia."
          : `ADMIN_GENERAL rechazó el pago por transferencia. Motivo: ${reason}`;
      const customerNotice =
        action === "approve"
          ? "Tu pago por transferencia fue validado. Tu pedido quedó pagado y ahora el negocio debe aceptarlo."
          : `Tu pago por transferencia fue rechazado. Motivo: ${reason}`;

      await connection.query(
        `
          INSERT INTO admin_messages (order_id, user_id, type, message, file_url)
          VALUES (?, ?, 'payment_validation', ?, NULL)
        `,
        [orderId, access.access.userId, adminMessage],
      );

      await connection.query(
        `
          INSERT INTO order_notes (order_id, user_id, note_type, note_text)
          VALUES (?, ?, 'system', ?)
        `,
        [orderId, access.access.userId, customerNotice],
      );

      const supportThreadId = await getOrCreateSupportThread({
        userId: Number(order.user_id),
        orderId,
      });

      await addSupportMessage({
        threadId: supportThreadId,
        senderId: access.access.userId,
        senderType: "admin",
        message:
          action === "approve"
            ? "Pago por transferencia aprobado por ADMIN_GENERAL."
            : `Pago por transferencia rechazado por ADMIN_GENERAL. Motivo: ${reason}`,
        messageType: "text",
      });

      await recordAuditLog(
        {
          userId: access.access.userId,
          action: action === "approve" ? "VALIDATE_PAYMENT" : "REJECT_PAYMENT",
          resourceType: "order",
          resourceId: orderId,
          oldValue: {
            status: order.status_name,
            payment_method: order.payment_method,
          },
          newValue: {
            status: nextStatus,
            reason,
          },
          ip: req.headers.get("x-forwarded-for"),
          userAgent: req.headers.get("user-agent"),
        },
        connection,
      );

      if (action === "approve") {
        await createNotificationForBusiness(
          Number(order.business_id),
          {
            type: "pago",
            title: `Pago validado #${orderId}`,
            message:
              "El pago por transferencia fue validado. El negocio ya puede aceptarlo.",
            relatedId: orderId,
            dataJson: {
              order_id: orderId,
              status: nextStatus,
              payment_method: "transferencia",
            },
          },
          connection,
        );
      }

      await connection.commit();
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }

    return NextResponse.json({
      success: true,
      message:
        action === "approve"
          ? "Pago aprobado correctamente"
          : "Pago rechazado correctamente",
      status: nextStatus,
    });
  } catch (error) {
    console.error("Error PATCH /api/admin/orders/[id]/payment:", error);
    if (error instanceof OrderStatusTransitionError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    return NextResponse.json(
      {
        error: "No se pudo validar el pago.",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}
