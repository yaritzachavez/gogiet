import type { PoolConnection, RowDataPacket } from "mysql2/promise";
import { type NextRequest, NextResponse } from "next/server";

import { getSafeErrorMessage } from "@/lib/api-error";
import pool from "@/lib/db";
import { getMercadoPagoWebhookSecret, getRuntimeEnvironment } from "@/lib/env";
import { getRequestLoggerContext, logger } from "@/lib/logger";
import {
  getMercadoPagoPayment,
  verifyMercadoPagoWebhookSignature,
} from "@/lib/mercadopago";
import {
  createNotificationForBusinessSafely,
  createNotificationsForAdminGeneralSafely,
} from "@/lib/notifications";
import {
  ensureOrderPaymentColumns,
  ensurePaymentsTable,
  findPaymentByWebhookEventId,
  upsertPaymentRecord,
} from "@/lib/order-payments";
import type { CanonicalOrderStatus } from "@/lib/order-status";
import {
  applyValidatedOrderStatusTransition,
  OrderStatusTransitionError,
  validateOrderStatusTransition,
} from "@/lib/order-status-guard";
import { ensureCoreOrderStatuses } from "@/lib/order-status-server";

type OrderRow = RowDataPacket & {
  id: number;
  business_id: number;
  user_id: number;
  total_amount: string | number;
  payment_method: string | null;
  payment_provider: string | null;
  provider_payment_id: string | null;
  payment_status: string | null;
  current_status: string | null;
};

type WebhookPayload = {
  id?: number | string;
  type?: string;
  topic?: string;
  action?: string;
  live_mode?: boolean;
  data?: {
    id?: string | number;
  };
  [key: string]: unknown;
};

type MercadoPagoWebhookOrderStatus = Extract<
  CanonicalOrderStatus,
  "paid" | "pending_payment" | "payment_review" | "payment_failed"
>;

function parseOrderIdFromReference(reference: unknown) {
  const value = String(reference ?? "").trim();
  const match = value.match(/order:(\d+)/i);
  return match ? Number(match[1]) : null;
}

function parseUserIdFromReference(reference: unknown) {
  const value = String(reference ?? "").trim();
  const match = value.match(/user:(\d+)/i);
  return match ? Number(match[1]) : null;
}

function parsePositiveNumber(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function normalizePaymentStatus(value: unknown) {
  return String(value ?? "")
    .trim()
    .toLowerCase();
}

function normalizeTopic(payload: WebhookPayload) {
  return String(payload.type ?? payload.topic ?? "")
    .trim()
    .toLowerCase();
}

function roundMoney(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? Number(parsed.toFixed(2)) : 0;
}

function parseMercadoPagoDate(value: unknown) {
  const date = value ? new Date(String(value)) : new Date();
  return Number.isNaN(date.getTime()) ? new Date() : date;
}

function mapWebhookPaymentStatusToOrderStatus(
  paymentStatus: string,
): MercadoPagoWebhookOrderStatus | null {
  if (paymentStatus === "approved") {
    return "paid";
  }

  if (paymentStatus === "pending" || paymentStatus === "in_process") {
    return "pending_payment";
  }

  if (paymentStatus === "in_mediation") {
    return "payment_review";
  }

  if (
    paymentStatus === "rejected" ||
    paymentStatus === "cancelled" ||
    paymentStatus === "refunded" ||
    paymentStatus === "charged_back"
  ) {
    return "payment_failed";
  }

  return null;
}

function shouldSkipOrderStatusUpdate(params: {
  currentStatus: string | null;
  nextStatus: MercadoPagoWebhookOrderStatus | null;
}) {
  const currentStatus = String(params.currentStatus ?? "")
    .trim()
    .toLowerCase();

  if (!params.nextStatus) {
    return true;
  }

  if (currentStatus === params.nextStatus) {
    return true;
  }

  if (
    (currentStatus === "paid" ||
      currentStatus === "accepted" ||
      currentStatus === "preparing" ||
      currentStatus === "ready_for_pickup" ||
      currentStatus === "driver_assigned" ||
      currentStatus === "on_the_way" ||
      currentStatus === "delivered") &&
    params.nextStatus !== "paid"
  ) {
    return true;
  }

  return false;
}

async function clearActiveCartForUser(conn: PoolConnection, userId: number) {
  await conn.query(
    `
      DELETE pc
      FROM products_cart pc
      INNER JOIN cart c ON c.id = pc.cart_id
      WHERE c.user_id = ?
        AND COALESCE(c.status, 'activo') = 'activo'
    `,
    [userId],
  );

  await conn.query(
    `
      UPDATE cart
      SET total = 0, updated_at = NOW()
      WHERE user_id = ?
        AND COALESCE(status, 'activo') = 'activo'
    `,
    [userId],
  );
}

export async function POST(req: NextRequest) {
  const requestContext = getRequestLoggerContext(req);
  const runtimeEnvironment = getRuntimeEnvironment();
  const url = new URL(req.url);
  const searchParams = url.searchParams;
  const body = (await req.json().catch(() => null)) as WebhookPayload | null;
  const topic = normalizeTopic(body ?? {});
  const signatureHeader = req.headers.get("x-signature");
  const requestIdHeader = req.headers.get("x-request-id");
  const signatureDataId =
    searchParams.get("data.id") ?? searchParams.get("id") ?? null;
  const paymentId = String(
    signatureDataId ?? body?.data?.id ?? body?.id ?? "",
  ).trim();
  const webhookEventId = String(requestIdHeader ?? "").trim();
  const notificationId = String(body?.id ?? "").trim() || null;

  let signatureCheck: ReturnType<
    typeof verifyMercadoPagoWebhookSignature
  > | null = null;

  const webhookSecret = getMercadoPagoWebhookSecret();

  if (!webhookSecret) {
    logger.warn(
      "payments.mercadopago.webhook_not_configured",
      "Webhook de Mercado Pago no configurado en este entorno",
      {
        ...requestContext,
        environment: runtimeEnvironment,
      },
    );

    return NextResponse.json(
      {
        success: false,
        error: "Webhook no configurado",
      },
      { status: 503 },
    );
  }

  try {
    signatureCheck = verifyMercadoPagoWebhookSignature({
      signatureHeader,
      requestIdHeader,
      dataId: signatureDataId,
    });
  } catch (error) {
    logger.error(
      "payments.mercadopago.webhook_config_error",
      "Configuración incompleta del webhook de Mercado Pago",
      {
        ...requestContext,
        error,
      },
    );
    return NextResponse.json(
      {
        success: false,
        error: "Webhook de pagos no disponible por configuración incompleta.",
      },
      { status: 500 },
    );
  }

  if (!signatureCheck?.ok) {
    logger.security(
      "payments.mercadopago.invalid_signature",
      "Firma inválida en webhook de Mercado Pago",
      {
        ...requestContext,
        severity: "high",
        reason: signatureCheck?.reason ?? "unknown",
        requestId: webhookEventId || null,
        topic: topic || null,
      },
    );
    return NextResponse.json(
      { success: false, error: "Firma de webhook inválida." },
      { status: 400 },
    );
  }

  if (!paymentId) {
    return NextResponse.json(
      { success: false, error: "No se recibió un payment_id válido." },
      { status: 400 },
    );
  }

  if (topic && topic !== "payment") {
    return NextResponse.json({ success: true, ignored: true, topic });
  }

  const conn = await pool.getConnection();

  try {
    await conn.beginTransaction();
    await ensureOrderPaymentColumns(conn);
    await ensurePaymentsTable(conn);
    await ensureCoreOrderStatuses(conn);

    if (webhookEventId) {
      const existingEvent = await findPaymentByWebhookEventId(
        conn,
        "MERCADOPAGO",
        webhookEventId,
      );

      if (existingEvent?.processed_at) {
        await conn.rollback();
        return NextResponse.json({
          success: true,
          duplicate: true,
          paymentId,
          webhookEventId,
        });
      }
    }

    const payment = await getMercadoPagoPayment(paymentId);
    const paymentStatus = normalizePaymentStatus(payment.status);
    const paidAt =
      paymentStatus === "approved"
        ? parseMercadoPagoDate(payment.date_approved)
        : null;
    const externalReference = String(payment.external_reference ?? "").trim();
    const metadataOrderId = parsePositiveNumber(payment.metadata?.orderId);
    const metadataUserId = parsePositiveNumber(payment.metadata?.userId);
    const orderId =
      parseOrderIdFromReference(externalReference) ?? metadataOrderId;
    const userIdFromReference = parseUserIdFromReference(externalReference);
    const amount = roundMoney(payment.transaction_amount);
    const currency = String(payment.currency_id ?? "")
      .trim()
      .toUpperCase();

    if (!orderId) {
      await conn.rollback();
      return NextResponse.json(
        { success: false, error: "No pudimos asociar el pago a un pedido." },
        { status: 422 },
      );
    }

    const [orderRows] = await conn.query<OrderRow[]>(
      `
        SELECT
          o.id,
          o.business_id,
          o.user_id,
          o.total_amount,
          COALESCE(o.payment_method, pm.name) AS payment_method,
          o.payment_provider,
          o.provider_payment_id,
          o.payment_status,
          osc.name AS current_status
        FROM orders o
        LEFT JOIN payment_methods pm ON pm.id = o.payment_method_id
        LEFT JOIN order_status_catalog osc ON osc.id = o.order_status_id
        WHERE o.id = ?
        LIMIT 1
      `,
      [orderId],
    );

    const order = orderRows[0];

    if (!order) {
      await conn.rollback();
      return NextResponse.json(
        { success: false, error: "El pedido asociado al webhook no existe." },
        { status: 404 },
      );
    }

    if (
      String(order.payment_method ?? "")
        .trim()
        .toLowerCase() !== "mercadopago"
    ) {
      await conn.rollback();
      return NextResponse.json(
        {
          success: false,
          error: "El pedido no está configurado para pagos con Mercado Pago.",
        },
        { status: 409 },
      );
    }

    if (currency !== "MXN") {
      await conn.rollback();
      return NextResponse.json(
        {
          success: false,
          error: "La moneda del pago no coincide con la esperada.",
        },
        { status: 409 },
      );
    }

    if (amount !== roundMoney(order.total_amount)) {
      await conn.rollback();
      return NextResponse.json(
        {
          success: false,
          error: "El monto del pago no coincide con el pedido.",
        },
        { status: 409 },
      );
    }

    if (metadataOrderId && metadataOrderId !== Number(order.id)) {
      await conn.rollback();
      return NextResponse.json(
        {
          success: false,
          error: "La metadata del pago no coincide con el pedido.",
        },
        { status: 409 },
      );
    }

    if (
      (metadataUserId && metadataUserId !== Number(order.user_id)) ||
      (userIdFromReference && userIdFromReference !== Number(order.user_id))
    ) {
      await conn.rollback();
      return NextResponse.json(
        {
          success: false,
          error: "El pago no pertenece al usuario del pedido.",
        },
        { status: 409 },
      );
    }

    if (
      String(order.current_status ?? "")
        .trim()
        .toLowerCase() === "cancelled" &&
      paymentStatus === "approved"
    ) {
      await conn.rollback();
      return NextResponse.json(
        {
          success: false,
          error: "No se puede marcar como pagado un pedido ya cancelado.",
        },
        { status: 409 },
      );
    }

    const nextStatus = mapWebhookPaymentStatusToOrderStatus(paymentStatus);
    let transitionedToPaid = false;
    let statusTransitionSkippedReason: string | null = null;

    if (!nextStatus) {
      statusTransitionSkippedReason = "payment_status_without_order_transition";
      logger.info(
        "payments.mercadopago.webhook_no_status_transition",
        "Webhook recibido sin cambio aplicable al flujo del pedido",
        {
          ...requestContext,
          orderId,
          paymentId,
          requestId: webhookEventId || null,
          paymentStatus,
          currentStatus: order.current_status,
        },
      );
    } else if (
      shouldSkipOrderStatusUpdate({
        currentStatus: order.current_status,
        nextStatus,
      })
    ) {
      statusTransitionSkippedReason = "order_status_update_skipped";
      logger.info(
        "payments.mercadopago.webhook_status_transition_skipped",
        "Webhook recibido pero no requiere transición de estado",
        {
          ...requestContext,
          orderId,
          paymentId,
          requestId: webhookEventId || null,
          paymentStatus,
          currentStatus: order.current_status,
          requestedStatus: nextStatus,
        },
      );
    } else {
      const { currentStatus } = validateOrderStatusTransition({
        currentStatus: order.current_status,
        nextStatus,
        role: "system",
        order: {
          id: orderId,
          businessId: Number(order.business_id),
          customerUserId: Number(order.user_id),
          driverUserId: null,
          paymentMethod: "mercadopago",
          currentStatus: String(order.current_status ?? ""),
        },
        actorUserId: 0,
        reason: `mercadopago_webhook:${paymentStatus}`,
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
          public_endpoint: "/api/webhooks/mercadopago",
          payment_id: paymentId,
          webhook_event_id: webhookEventId || null,
          notification_id: notificationId,
        },
      });

      transitionedToPaid = nextStatus === "paid";
    }

    await conn.query(
      `
        UPDATE orders
        SET
          payment_provider = 'MERCADOPAGO',
          provider_payment_id = ?,
          payment_status = ?,
          paid_at = CASE
            WHEN ? = 'approved' THEN COALESCE(paid_at, NOW())
            ELSE paid_at
          END,
          amount_paid = CASE
            WHEN ? = 'approved' THEN ?
            ELSE amount_paid
          END,
          updated_at = NOW()
        WHERE id = ?
      `,
      [paymentId, paymentStatus, paymentStatus, paymentStatus, amount, orderId],
    );

    if (paymentStatus === "approved") {
      await clearActiveCartForUser(conn, Number(order.user_id));
    }

    await upsertPaymentRecord(conn, {
      orderId,
      provider: "MERCADOPAGO",
      providerPaymentId: paymentId,
      webhookEventId: webhookEventId || notificationId,
      status: paymentStatus || "unknown",
      amount,
      currency,
      paidAt,
      rawEvent: {
        headers: {
          x_request_id: webhookEventId || null,
          x_signature_present: Boolean(signatureHeader),
        },
        query: Object.fromEntries(searchParams.entries()),
        body,
      },
      rawResponse: payment,
      signatureValidatedAt: signatureCheck.validatedAt,
      processedAt: new Date(),
    });

    if (transitionedToPaid) {
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

    logger.info(
      "payments.mercadopago.webhook_processed",
      "Webhook de Mercado Pago procesado",
      {
        ...requestContext,
        orderId,
        paymentId,
        requestId: webhookEventId || null,
        paymentStatus,
        transitionedToPaid,
        skippedTransitionReason: statusTransitionSkippedReason,
      },
    );

    return NextResponse.json({
      success: true,
      orderId,
      paymentId,
      paymentStatus,
    });
  } catch (error) {
    await conn.rollback();
    logger.error(
      "payments.mercadopago.webhook_processing_error",
      "Error procesando webhook de Mercado Pago",
      {
        ...requestContext,
        paymentId,
        requestId: webhookEventId || null,
        error,
      },
    );

    if (error instanceof OrderStatusTransitionError) {
      return NextResponse.json(
        {
          success: false,
          error: getSafeErrorMessage(
            error,
            "No pudimos procesar la notificación de pago.",
          ),
        },
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
