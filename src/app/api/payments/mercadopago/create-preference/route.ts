import type { RowDataPacket } from "mysql2/promise";
import { type NextRequest, NextResponse } from "next/server";

import { getAuthUser } from "@/lib/admin-security";
import { isAuthUserActive } from "@/lib/auth-users";
import pool from "@/lib/db";
import { createMercadoPagoPreference, getAppUrl } from "@/lib/mercadopago";
import {
  ensureOrderPaymentColumns,
  ensurePaymentsTable,
  upsertPaymentRecord,
} from "@/lib/order-payments";
import { resolveCanonicalOrderStatus } from "@/lib/order-status";
import { ensureCoreOrderStatuses } from "@/lib/order-status-server";

type OrderRow = RowDataPacket & {
  id: number;
  user_id: number;
  subtotal: string | number;
  delivery_fee: string | number;
  service_fee: string | number;
  platform_fee: string | number;
  driver_fee: string | number;
  terminal_fee: string | number;
  tip_amount: string | number;
  discount_amount: string | number;
  total_amount: string | number;
  payment_method: string | null;
  status_name: string | null;
  customer_name: string | null;
  customer_email: string | null;
};

type OrderItemRow = RowDataPacket & {
  product_id: number;
  product_name_snapshot: string;
  quantity: number;
  unit_price: string | number;
};

function parsePositiveNumber(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function buildExternalReference(orderId: number, userId: number) {
  return `order:${orderId}:user:${userId}`;
}

function roundMoney(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? Number(parsed.toFixed(2)) : 0;
}

export async function POST(req: NextRequest) {
  const auth = getAuthUser(req);

  if (!auth.token || !auth.user) {
    return NextResponse.json(
      { success: false, error: "Necesitas iniciar sesión para continuar." },
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

  try {
    const body = await req.json().catch(() => null);
    const orderId = parsePositiveNumber(body?.orderId);
    const requestedUserId = parsePositiveNumber(body?.userId);
    const frontendTotal = Number(body?.total);
    const frontendItems = Array.isArray(body?.items) ? body.items : [];

    if (!orderId) {
      return NextResponse.json(
        { success: false, error: "Falta el pedido a pagar." },
        { status: 400 },
      );
    }

    if (requestedUserId && requestedUserId !== auth.user.id) {
      return NextResponse.json(
        { success: false, error: "El pedido no pertenece a esta sesión." },
        { status: 403 },
      );
    }

    await ensureOrderPaymentColumns(conn);
    await ensurePaymentsTable(conn);
    await ensureCoreOrderStatuses(conn);

    const [orderRows] = await conn.query<OrderRow[]>(
      `
        SELECT
          o.id,
          o.user_id,
          o.subtotal,
          o.delivery_fee,
          o.service_fee,
          o.platform_fee,
          o.driver_fee,
          o.terminal_fee,
          o.tip_amount,
          o.discount_amount,
          o.total_amount,
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
      return NextResponse.json(
        {
          success: false,
          error: "No encontramos ese pedido para este usuario.",
        },
        { status: 404 },
      );
    }

    if (String(order.payment_method ?? "").toLowerCase() !== "mercadopago") {
      return NextResponse.json(
        {
          success: false,
          error: "Este pedido no fue creado para pago con Mercado Pago.",
        },
        { status: 400 },
      );
    }

    const currentStatus = resolveCanonicalOrderStatus(order.status_name);

    if (
      currentStatus !== "pending_payment" &&
      currentStatus !== "pending" &&
      currentStatus !== "payment_failed"
    ) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Este pedido ya no está disponible para iniciar un nuevo cobro.",
        },
        { status: 400 },
      );
    }

    const backendTotal = Number(order.total_amount ?? 0);

    if (
      !Number.isFinite(frontendTotal) ||
      Number(frontendTotal.toFixed(2)) !== Number(backendTotal.toFixed(2))
    ) {
      return NextResponse.json(
        {
          success: false,
          error:
            "El total del pedido no coincide con el calculado por el servidor.",
        },
        { status: 400 },
      );
    }

    const [orderItemRows] = await conn.query<OrderItemRow[]>(
      `
        SELECT product_id, product_name_snapshot, quantity, unit_price
        FROM order_items
        WHERE order_id = ?
        ORDER BY id ASC
      `,
      [orderId],
    );

    if (!orderItemRows.length) {
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
      frontendItems.length !== orderItemRows.length
    ) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Los productos del pedido no coinciden con el carrito enviado.",
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

      const hasMismatch = orderItemRows.some((item) => {
        return (
          frontendMap.get(String(item.product_id)) !== Number(item.quantity)
        );
      });

      if (hasMismatch) {
        return NextResponse.json(
          {
            success: false,
            error:
              "Los productos del pedido no coinciden con lo guardado en servidor.",
          },
          { status: 400 },
        );
      }
    }

    const appUrl = getAppUrl();
    const externalReference = buildExternalReference(orderId, auth.user.id);
    const productItems = orderItemRows.map((item) => ({
      id: String(item.product_id),
      title: item.product_name_snapshot,
      quantity: Number(item.quantity),
      currency_id: "MXN",
      unit_price: roundMoney(item.unit_price),
    }));
    const productItemsTotal = roundMoney(
      orderItemRows.reduce(
        (total, item) =>
          total + Number(item.quantity) * roundMoney(item.unit_price),
        0,
      ),
    );
    const remainingAmount = roundMoney(backendTotal - productItemsTotal);
    const preferenceItems =
      remainingAmount >= 0
        ? [
            ...productItems,
            ...(remainingAmount > 0
              ? [
                  {
                    id: `order-${orderId}-fees`,
                    title: "Envío y cargos de servicio",
                    quantity: 1,
                    currency_id: "MXN",
                    unit_price: remainingAmount,
                  },
                ]
              : []),
          ]
        : [
            {
              id: `order-${orderId}`,
              title: `Pedido Gogi Eats #${orderId}`,
              quantity: 1,
              currency_id: "MXN",
              unit_price: backendTotal,
            },
          ];

    const preference = await createMercadoPagoPreference({
      items: preferenceItems,
      external_reference: externalReference,
      notification_url: `${appUrl}/api/webhooks/mercadopago`,
      back_urls: {
        success: `${appUrl}/checkout/success?orderId=${orderId}`,
        failure: `${appUrl}/checkout/failure?orderId=${orderId}`,
        pending: `${appUrl}/checkout/pending?orderId=${orderId}`,
      },
      auto_return: "approved",
      metadata: {
        orderId,
        userId: auth.user.id,
        subtotal: roundMoney(order.subtotal),
        deliveryFee: roundMoney(order.delivery_fee),
        serviceFee: roundMoney(order.service_fee),
        platformFee: roundMoney(order.platform_fee),
        driverFee: roundMoney(order.driver_fee),
        terminalFee: roundMoney(order.terminal_fee),
        tipAmount: roundMoney(order.tip_amount),
        discountAmount: roundMoney(order.discount_amount),
        total: backendTotal,
      },
      payer: {
        email: String(order.customer_email ?? "").trim() || undefined,
        name: String(order.customer_name ?? "").trim() || undefined,
      },
    });

    await conn.query(
      `
        UPDATE orders
        SET
          payment_provider = 'MERCADOPAGO',
          payment_status = ?,
          updated_at = NOW()
        WHERE id = ?
      `,
      ["pending", orderId],
    );

    await upsertPaymentRecord(conn, {
      orderId,
      provider: "MERCADOPAGO",
      status: "pending",
      amount: backendTotal,
      currency: "MXN",
      rawResponse: preference,
    });

    const initPoint =
      typeof preference.init_point === "string" && preference.init_point.trim()
        ? preference.init_point.trim()
        : typeof preference.sandbox_init_point === "string" &&
            preference.sandbox_init_point.trim()
          ? preference.sandbox_init_point.trim()
          : "";

    if (!initPoint) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Mercado Pago no devolvió una URL válida para continuar el pago.",
        },
        { status: 502 },
      );
    }

    return NextResponse.json({
      success: true,
      initPoint,
      init_point: preference.init_point ?? null,
      sandbox_init_point: preference.sandbox_init_point ?? null,
      preferenceId: preference.id ?? null,
      orderId,
    });
  } catch (error) {
    console.error(
      "Error POST /api/payments/mercadopago/create-preference:",
      error,
    );
    return NextResponse.json(
      {
        success: false,
        error: "No pudimos iniciar el pago con tarjeta. Intenta nuevamente.",
      },
      { status: 500 },
    );
  } finally {
    conn.release();
  }
}
