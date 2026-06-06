import crypto from "node:crypto";

import type { PoolConnection, RowDataPacket } from "mysql2/promise";
import { type NextRequest, NextResponse } from "next/server";

import { getAuthUser } from "@/lib/admin-security";
import { isAuthUserActive } from "@/lib/auth-users";
import pool from "@/lib/db";
import { createMercadoPagoPayment, getAppUrl } from "@/lib/mercadopago";
import {
  createNotificationForBusinessSafely,
  createNotificationsForAdminGeneralSafely,
} from "@/lib/notifications";
import {
  ensureOrderPaymentColumns,
  ensurePaymentsTable,
  findApprovedPaymentForOrder,
  findLatestPaymentForOrder,
  upsertPaymentRecord,
} from "@/lib/order-payments";
import { resolveCanonicalOrderStatus } from "@/lib/order-status";
import {
  ensureCanonicalOrderStatus,
  ensureCoreOrderStatuses,
} from "@/lib/order-status-server";

type OrderRow = RowDataPacket & {
  id: number;
  business_id: number;
  user_id: number;
  total_amount: string | number;
  payment_method_id: number;
  payment_method: string | null;
  status_name: string | null;
  customer_name: string | null;
  customer_email: string | null;
};

type OrderItemRow = RowDataPacket & {
  product_id: number;
  quantity: number;
};

function parsePositiveNumber(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function roundMoney(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? Number(parsed.toFixed(2)) : 0;
}

function buildExternalReference(orderId: number, userId: number) {
  return `order:${orderId}:user:${userId}`;
}

function normalizePaymentStatus(value: unknown) {
  return String(value ?? "")
    .trim()
    .toLowerCase();
}

function mapPaymentStatusToOrderStatus(paymentStatus: string) {
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

function parseMercadoPagoDate(value: unknown) {
  const date = value ? new Date(String(value)) : new Date();
  return Number.isNaN(date.getTime()) ? new Date() : date;
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
  const auth = getAuthUser(req);

  if (!auth.token || !auth.user) {
    return NextResponse.json(
      { success: false, error: "Necesitas iniciar sesión para pagar." },
      { status: 401 },
    );
  }

  if (!(await isAuthUserActive(auth.user.id))) {
    return NextResponse.json(
      { success: false, error: "Tu cuenta está inactiva. Contacta a soporte." },
      { status: 403 },
    );
  }

  const conn = await pool.getConnection();
  let paymentAttemptId: number | null = null;
  let paymentAttemptReference: string | null = null;
  let transactionOpen = false;
  let currentOrderId: number | null = null;
  let currentPaymentMethodId: number | null = null;
  let currentOrderTotal = 0;

  try {
    const body = await req.json().catch(() => null);
    const orderId = parsePositiveNumber(body?.orderId);
    const token = String(body?.token ?? "").trim();
    const paymentMethodId = String(body?.paymentMethodId ?? "").trim();
    const issuerId = String(body?.issuerId ?? "").trim() || null;
    const installments = parsePositiveNumber(body?.installments) ?? 1;
    const identificationType = String(body?.identificationType ?? "").trim();
    const identificationNumber = String(
      body?.identificationNumber ?? "",
    ).trim();
    const frontendTotal = Number(body?.total);
    const frontendItems = Array.isArray(body?.items) ? body.items : [];

    if (!orderId || !token || !paymentMethodId) {
      return NextResponse.json(
        {
          success: false,
          error: "Faltan datos de pago para procesar la tarjeta.",
        },
        { status: 400 },
      );
    }

    currentOrderId = orderId;

    await conn.beginTransaction();
    transactionOpen = true;
    await ensureOrderPaymentColumns(conn);
    await ensurePaymentsTable(conn);
    await ensureCoreOrderStatuses(conn);

    const [orderRows] = await conn.query<OrderRow[]>(
      `
        SELECT
          o.id,
          o.business_id,
          o.user_id,
          o.total_amount,
          o.payment_method_id,
          o.payment_method,
          osc.name AS status_name,
          CONCAT(u.first_name, ' ', COALESCE(u.last_name, '')) AS customer_name,
          u.email AS customer_email
        FROM orders o
        LEFT JOIN users u ON u.id = o.user_id
        LEFT JOIN order_status_catalog osc ON osc.id = o.order_status_id
        WHERE o.id = ?
        LIMIT 1
      `,
      [orderId],
    );

    const order = orderRows[0];

    if (!order || Number(order.user_id) !== auth.user.id) {
      await conn.rollback();
      transactionOpen = false;
      return NextResponse.json(
        { success: false, error: "No encontramos ese pedido para tu sesión." },
        { status: 404 },
      );
    }

    if (String(order.payment_method ?? "").toLowerCase() !== "mercadopago") {
      await conn.rollback();
      transactionOpen = false;
      return NextResponse.json(
        {
          success: false,
          error: "Este pedido no fue creado para pago con Mercado Pago.",
        },
        { status: 400 },
      );
    }

    currentPaymentMethodId = Number(order.payment_method_id ?? 0) || null;
    const currentStatus = resolveCanonicalOrderStatus(order.status_name);
    if (
      currentStatus !== "pending_payment" &&
      currentStatus !== "payment_failed"
    ) {
      await conn.rollback();
      transactionOpen = false;
      return NextResponse.json(
        {
          success: false,
          error: "Este pedido ya no está disponible para cobrar.",
        },
        { status: 409 },
      );
    }

    const backendTotal = roundMoney(order.total_amount);
    currentOrderTotal = backendTotal;
    if (
      !Number.isFinite(frontendTotal) ||
      Number(frontendTotal.toFixed(2)) !== backendTotal
    ) {
      await conn.rollback();
      transactionOpen = false;
      return NextResponse.json(
        {
          success: false,
          error: "El total del pedido no coincide con el servidor.",
        },
        { status: 400 },
      );
    }

    const [orderItems] = await conn.query<OrderItemRow[]>(
      `
        SELECT product_id, quantity
        FROM order_items
        WHERE order_id = ?
        ORDER BY id ASC
      `,
      [orderId],
    );

    if (!orderItems.length) {
      await conn.rollback();
      transactionOpen = false;
      return NextResponse.json(
        {
          success: false,
          error: "El pedido no tiene productos válidos para cobrar.",
        },
        { status: 400 },
      );
    }

    if (
      frontendItems.length > 0 &&
      frontendItems.length !== orderItems.length
    ) {
      await conn.rollback();
      transactionOpen = false;
      return NextResponse.json(
        {
          success: false,
          error: "Los productos del carrito no coinciden con el pedido.",
        },
        { status: 400 },
      );
    }

    if (frontendItems.length > 0) {
      const frontendMap = new Map<string, number>();
      for (const item of frontendItems) {
        const productId = parsePositiveNumber(
          item?.product_id ?? item?.productId,
        );
        const quantity = parsePositiveNumber(item?.quantity);
        if (!productId || !quantity) {
          await conn.rollback();
          transactionOpen = false;
          return NextResponse.json(
            {
              success: false,
              error: "Hay productos inválidos en la solicitud de pago.",
            },
            { status: 400 },
          );
        }
        frontendMap.set(String(productId), quantity);
      }

      const hasMismatch = orderItems.some((item) => {
        return (
          frontendMap.get(String(item.product_id)) !== Number(item.quantity)
        );
      });

      if (hasMismatch) {
        await conn.rollback();
        transactionOpen = false;
        return NextResponse.json(
          {
            success: false,
            error: "Los productos enviados no coinciden con el pedido.",
          },
          { status: 400 },
        );
      }
    }

    const approvedPayment = await findApprovedPaymentForOrder(
      conn,
      orderId,
      "MERCADOPAGO",
    );

    if (approvedPayment?.id) {
      await conn.rollback();
      transactionOpen = false;
      return NextResponse.json(
        {
          success: false,
          error:
            "Este pedido ya tiene un pago aprobado y no puede cobrarse otra vez.",
        },
        { status: 409 },
      );
    }

    const latestPayment = await findLatestPaymentForOrder(
      conn,
      orderId,
      "MERCADOPAGO",
    );
    const latestPaymentState = normalizePaymentStatus(
      latestPayment?.payment_status ?? latestPayment?.status,
    );
    const blockingAttemptStates = new Set([
      "initiated",
      "processing",
      "pending",
      "in_process",
      "review",
      "awaiting_payment",
      "awaiting_confirmation",
      "approved",
      "paid",
    ]);

    if (latestPayment?.id && blockingAttemptStates.has(latestPaymentState)) {
      await conn.rollback();
      transactionOpen = false;
      return NextResponse.json(
        {
          success: false,
          error:
            "Ya existe un intento de cobro activo para este pedido. Espera su confirmación o revisa el estado del pago.",
        },
        { status: 409 },
      );
    }

    const externalReference = buildExternalReference(orderId, auth.user.id);
    const appUrl = getAppUrl();
    const payerEmail = String(order.customer_email ?? "").trim();

    if (!payerEmail) {
      await conn.rollback();
      transactionOpen = false;
      return NextResponse.json(
        {
          success: false,
          error: "Tu cuenta no tiene correo válido para procesar el pago.",
        },
        { status: 400 },
      );
    }

    paymentAttemptReference = `gogi-order-${orderId}-${crypto.randomUUID()}`;
    paymentAttemptId = await upsertPaymentRecord(conn, {
      orderId,
      paymentMethodId: currentPaymentMethodId,
      paymentStatus: "pending",
      transactionReference: paymentAttemptReference,
      providerName: "Mercado Pago",
      provider: "MERCADOPAGO",
      status: "initiated",
      amount: backendTotal,
      currency: "MXN",
      rawEvent: {
        phase: "attempt_created",
        frontendTotal,
        issuerId,
        installments,
        paymentMethodId,
        identificationType: identificationType || null,
        frontendItemsCount: frontendItems.length,
      },
    });

    await conn.query(
      `
        UPDATE orders
        SET
          payment_provider = 'MERCADOPAGO',
          payment_status = 'pending',
          updated_at = NOW()
        WHERE id = ?
      `,
      [orderId],
    );

    await conn.commit();
    transactionOpen = false;

    const payment = await createMercadoPagoPayment(
      {
        transaction_amount: backendTotal,
        token,
        description: `Pedido Gogi Eats #${orderId}`,
        installments,
        payment_method_id: paymentMethodId,
        issuer_id: issuerId,
        payer: {
          email: payerEmail,
          ...(identificationType && identificationNumber
            ? {
                identification: {
                  type: identificationType,
                  number: identificationNumber,
                },
              }
            : {}),
        },
        external_reference: externalReference,
        notification_url: `${appUrl}/api/webhooks/mercadopago`,
        metadata: {
          orderId,
          userId: auth.user.id,
          total: backendTotal,
          integration: "checkout_api_in_app",
        },
      },
      paymentAttemptReference,
    );

    const paymentId = String(payment.id ?? "").trim();
    const paymentStatus = normalizePaymentStatus(payment.status);
    const paidAt =
      paymentStatus === "approved"
        ? parseMercadoPagoDate(payment.date_approved)
        : null;
    const nextStatus = mapPaymentStatusToOrderStatus(paymentStatus);

    await conn.beginTransaction();
    transactionOpen = true;

    if (nextStatus) {
      const { statusId } = await ensureCanonicalOrderStatus(nextStatus, conn);
      await conn.query(
        `
          UPDATE orders
          SET
            order_status_id = ?,
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
        [
          statusId,
          paymentId || null,
          paymentStatus || "unknown",
          paymentStatus,
          paymentStatus,
          backendTotal,
          orderId,
        ],
      );
    } else {
      await conn.query(
        `
          UPDATE orders
          SET
            payment_provider = 'MERCADOPAGO',
            provider_payment_id = ?,
            payment_status = ?,
            updated_at = NOW()
          WHERE id = ?
        `,
        [paymentId || null, paymentStatus || "unknown", orderId],
      );
    }

    await upsertPaymentRecord(conn, {
      id: paymentAttemptId ?? undefined,
      orderId,
      paymentMethodId: currentPaymentMethodId,
      paymentStatus:
        paymentStatus === "approved"
          ? "approved"
          : paymentStatus === "rejected" ||
              paymentStatus === "cancelled" ||
              paymentStatus === "charged_back" ||
              paymentStatus === "refunded"
            ? "rejected"
            : "pending",
      transactionReference: paymentAttemptReference,
      providerName: "Mercado Pago",
      provider: "MERCADOPAGO",
      providerPaymentId: paymentId || null,
      status: paymentStatus || "unknown",
      amount: backendTotal,
      currency: "MXN",
      paidAt,
      rawResponse: payment,
      processedAt: new Date(),
    });

    if (paymentStatus === "approved") {
      await clearActiveCartForUser(conn, auth.user.id);
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
          title: `Mercado Pago aprobado #${orderId}`,
          message: "Mercado Pago confirmó un pago aprobado desde Checkout API.",
          relatedId: orderId,
        },
        conn,
      );
    }

    await conn.commit();
    transactionOpen = false;

    return NextResponse.json({
      success: true,
      orderId,
      paymentId: paymentId || null,
      paymentStatus: paymentStatus || "unknown",
      statusDetail: payment.status_detail ?? null,
      orderStatus: nextStatus,
    });
  } catch (error) {
    console.error(
      "Error POST /api/payments/mercadopago/process-payment:",
      error,
    );

    if (transactionOpen) {
      await conn.rollback();
      transactionOpen = false;
    }

    if (paymentAttemptReference && currentOrderId) {
      try {
        await conn.query(
          `
            UPDATE orders
            SET
              payment_provider = 'MERCADOPAGO',
              payment_status = 'failed',
              updated_at = NOW()
            WHERE id = ?
              AND LOWER(COALESCE(payment_status, '')) <> 'approved'
          `,
          [currentOrderId],
        );

        await upsertPaymentRecord(conn, {
          id: paymentAttemptId ?? undefined,
          orderId: currentOrderId,
          paymentMethodId: currentPaymentMethodId,
          paymentStatus: "failed",
          transactionReference: paymentAttemptReference,
          providerName: "Mercado Pago",
          provider: "MERCADOPAGO",
          status: "provider_error",
          amount: currentOrderTotal,
          currency: "MXN",
          processedAt: new Date(),
          rawResponse: {
            error:
              error instanceof Error ? error.message : "unknown_provider_error",
          },
        });
      } catch (persistError) {
        console.error(
          "Error persisting Mercado Pago failure attempt:",
          persistError,
        );
      }
    }

    return NextResponse.json(
      {
        success: false,
        error: "No pudimos procesar el pago con tarjeta. Intenta nuevamente.",
      },
      { status: 500 },
    );
  } finally {
    conn.release();
  }
}
