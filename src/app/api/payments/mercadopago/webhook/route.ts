import type { RowDataPacket } from "mysql2/promise";
import { type NextRequest, NextResponse } from "next/server";

import pool from "@/lib/db";
import { getMercadoPagoPayment } from "@/lib/mercadopago";
import {
  ensureOrderPaymentColumns,
  ensurePaymentsTable,
  upsertPaymentRecord,
} from "@/lib/order-payments";
import {
  applyValidatedOrderStatusTransition,
  OrderStatusTransitionError,
  validateOrderStatusTransition,
} from "@/lib/order-status-guard";
import { ensureCoreOrderStatuses } from "@/lib/order-status-server";
import {
  createNotificationForBusinessSafely,
  createNotificationsForAdminGeneralSafely,
} from "@/lib/notifications";

type OrderRow = RowDataPacket & {
  id: number;
  business_id: number;
  current_status: string | null;
};

function parseOrderIdFromReference(reference: unknown) {
  const value = String(reference ?? "").trim();
  const match = value.match(/order:(\d+)/i);
  return match ? Number(match[1]) : null;
}

function normalizePaymentStatus(value: unknown) {
  return String(value ?? "")
    .trim()
    .toLowerCase();
}

export async function POST(req: NextRequest) {
  const searchParams = new URL(req.url).searchParams;
  const body = await req.json().catch(() => null);

  const paymentId =
    String(
      searchParams.get("data.id") ??
        searchParams.get("id") ??
        body?.data?.id ??
        body?.id ??
        "",
    ).trim();

  if (!paymentId) {
    return NextResponse.json({ success: true, ignored: true });
  }

  const conn = await pool.getConnection();

  try {
    const payment = await getMercadoPagoPayment(paymentId);
    const paymentStatus = normalizePaymentStatus(payment.status);
    const externalReference =
      payment.external_reference ??
      body?.external_reference ??
      body?.data?.external_reference ??
      payment.metadata?.orderId;
    const orderIdFromMetadata = Number(payment.metadata?.orderId ?? 0);
    const orderId =
      parseOrderIdFromReference(externalReference) ??
      (Number.isFinite(orderIdFromMetadata) && orderIdFromMetadata > 0
        ? orderIdFromMetadata
        : null);

    if (!orderId) {
      return NextResponse.json({ success: true, ignored: true });
    }

    await conn.beginTransaction();
    await ensureOrderPaymentColumns(conn);
    await ensurePaymentsTable(conn);
    await ensureCoreOrderStatuses(conn);

    const [orderRows] = await conn.query<OrderRow[]>(
      `
        SELECT o.id, o.business_id, osc.name AS current_status
        FROM orders o
        LEFT JOIN order_status_catalog osc ON osc.id = o.order_status_id
        WHERE o.id = ?
        LIMIT 1
      `,
      [orderId],
    );

    const order = orderRows[0];

    if (!order) {
      await conn.rollback();
      return NextResponse.json({ success: true, ignored: true });
    }

    let nextStatus: "paid" | "pending_payment" | "payment_failed" | null =
      null;

    if (paymentStatus === "approved") {
      nextStatus = "paid";
    } else if (paymentStatus === "pending" || paymentStatus === "in_process") {
      nextStatus = "pending_payment";
    } else if (
      paymentStatus === "rejected" ||
      paymentStatus === "cancelled" ||
      paymentStatus === "refunded" ||
      paymentStatus === "charged_back"
    ) {
      nextStatus = "payment_failed";
    }

    if (nextStatus) {
      const { currentStatus } = validateOrderStatusTransition({
        currentStatus: order.current_status,
        nextStatus,
        role: "system",
        order: {
          id: orderId,
          businessId: Number(order.business_id),
          customerUserId: 0,
          driverUserId: null,
          paymentMethod: "mercadopago",
          currentStatus: String(order.current_status ?? ""),
        },
        actorUserId: 0,
        reason: `webhook:${paymentStatus}`,
      });

      await applyValidatedOrderStatusTransition(conn, {
        orderId,
        nextStatus,
        actorUserId: 0,
        actorRole: "system",
        currentStatus,
        reason: `Mercado Pago webhook: ${paymentStatus}`,
        metadata: {
          endpoint: "/api/payments/mercadopago/webhook",
          payment_id: paymentId,
        },
      });

      await conn.query(
        `
          UPDATE orders
          SET
            payment_provider = 'MERCADOPAGO',
            provider_payment_id = ?,
            payment_status = ?,
            paid_at = CASE WHEN ? = 'approved' THEN COALESCE(paid_at, NOW()) ELSE paid_at END,
            amount_paid = CASE
              WHEN ? = 'approved' THEN ?
              ELSE amount_paid
            END,
            updated_at = NOW()
          WHERE id = ?
        `,
        [
          paymentId,
          paymentStatus,
          paymentStatus,
          paymentStatus,
          Number(payment.transaction_amount ?? 0),
          orderId,
        ],
      );
    }

    await upsertPaymentRecord(conn, {
      orderId,
      provider: "MERCADOPAGO",
      providerPaymentId: paymentId,
      status: paymentStatus || "unknown",
      amount: Number(payment.transaction_amount ?? 0),
      currency: String(payment.currency_id ?? "MXN"),
      rawResponse: payment,
    });

    if (paymentStatus === "approved") {
      await createNotificationForBusinessSafely(
        Number(order.business_id),
        {
          type: "pago",
          title: `Pago aprobado #${orderId}`,
          message:
            "El pago con tarjeta fue aprobado. Ya puedes preparar este pedido.",
          relatedId: orderId,
          dataJson: {
            order_id: orderId,
            payment_provider: "MERCADOPAGO",
            payment_id: paymentId,
          },
        },
        conn,
      );

      await createNotificationsForAdminGeneralSafely(
        {
          type: "pago",
          title: `Pago aprobado #${orderId}`,
          message:
            "Mercado Pago confirmó el cobro del pedido y quedó marcado como pagado.",
          relatedId: orderId,
        },
        conn,
      );
    }

    await conn.commit();

    return NextResponse.json({ success: true });
  } catch (error) {
    await conn.rollback();
    console.error("Error POST /api/payments/mercadopago/webhook:", error);
    if (error instanceof OrderStatusTransitionError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.statusCode },
      );
    }
    return NextResponse.json(
      { success: false, error: "No pudimos procesar la notificación de pago." },
      { status: 500 },
    );
  } finally {
    conn.release();
  }
}
