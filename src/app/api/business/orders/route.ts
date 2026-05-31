import type { RowDataPacket } from "mysql2/promise";
import { type NextRequest, NextResponse } from "next/server";

import { getAuthUser } from "@/lib/admin-security";
import { resolveBusinessAccess } from "@/lib/business-panel";
import pool, { getFriendlyDatabaseErrorMessage, logDbUsage } from "@/lib/db";
import {
  getOrderStatusLabel,
  resolveCanonicalOrderStatus,
} from "@/lib/order-status";
import { buildUserAvatarSelect, getUserAvatarColumns } from "@/lib/user-avatar";

type OrderRow = RowDataPacket & {
  id: number;
  business_id: number;
  business_name: string;
  subtotal: string | number | null;
  service_fee: string | number | null;
  delivery_fee: string | number | null;
  total_amount: string | number;
  status_name: string | null;
  placed_at: string | null;
  created_at: string;
  customer_name: string | null;
  payment_method: string | null;
  payment_receipt_url: string | null;
  street: string | null;
  external_number: string | null;
  internal_number: string | null;
  neighborhood: string | null;
  city: string | null;
  state: string | null;
  customer_notes: string | null;
  delivery_id: number | null;
  driver_user_id: number | null;
  delivery_status_name: string | null;
  delivery_name: string | null;
  delivery_phone: string | null;
  delivery_profile_image_url: string | null;
  delivery_status_is_final: number | boolean | null;
};

type OrderItemRow = RowDataPacket & {
  id: number;
  order_id: number;
  product_name: string;
  quantity: number;
  subtotal: string | number;
  notes: string | null;
};

function toPositiveNumber(value: string | null) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function buildAddress(row: OrderRow) {
  return [
    row.street?.trim(),
    row.external_number?.trim(),
    row.internal_number?.trim() ? `Int. ${row.internal_number.trim()}` : null,
    row.neighborhood?.trim(),
    row.city?.trim(),
    row.state?.trim(),
  ]
    .filter(Boolean)
    .join(", ");
}

export async function GET(req: NextRequest) {
  try {
    const authUser = getAuthUser(req);

    if (!authUser?.token) {
      return NextResponse.json(
        { success: false, error: "Token faltante", orders: [] },
        { status: 401 },
      );
    }

    if (!authUser?.user) {
      return NextResponse.json(
        { success: false, error: "Token inválido", orders: [] },
        { status: 401 },
      );
    }

    const requestedBusinessId = toPositiveNumber(
      req.nextUrl.searchParams.get("business_id"),
    );
    const access = await resolveBusinessAccess(
      authUser.user.id,
      requestedBusinessId,
    );

    if (process.env.NODE_ENV !== "production") {
      console.log("[business/orders] access", {
        userId: authUser.user.id,
        requestedBusinessId,
        resolvedBusinessId: access.businessId,
        businessIds: access.businessIds,
        roles: access.roles,
      });
    }

    logDbUsage("/api/business/orders", {
      userId: access.userId,
      email: access.email,
      role: access.roles,
    });

    if (!access.businessId) {
      return NextResponse.json({
        success: true,
        orders: [],
        message: "No tienes negocio asignado",
      });
    }

    const avatarColumns = await getUserAvatarColumns();
    const deliveryAvatarSelect = buildUserAvatarSelect(
      "du",
      avatarColumns,
      "delivery_profile_image_url",
    );

    const [orderRows] = await pool.query<OrderRow[]>(
      `
        SELECT
          o.id,
          o.business_id,
          b.name AS business_name,
          o.subtotal,
          o.service_fee,
          o.delivery_fee,
          o.total_amount,
          osc.name AS status_name,
          o.placed_at,
          o.created_at,
          TRIM(CONCAT_WS(' ', u.first_name, u.last_name)) AS customer_name,
          COALESCE(o.payment_method, pm.name) AS payment_method,
          a.street,
          a.external_number,
          a.internal_number,
          a.neighborhood,
          a.city,
          a.state,
          o.customer_notes,
          COALESCE(o.payment_receipt_url, o.comprobante_pago_url) AS payment_receipt_url,
          d.id AS delivery_id,
          COALESCE(o.driver_id, d.driver_user_id) AS driver_user_id,
          dsc.name AS delivery_status_name,
          ${deliveryAvatarSelect},
          TRIM(CONCAT_WS(' ', du.first_name, du.last_name)) AS delivery_name,
          du.phone AS delivery_phone,
          dsc.is_final AS delivery_status_is_final
        FROM orders o
        INNER JOIN business b ON b.id = o.business_id
        LEFT JOIN users u ON u.id = o.user_id
        LEFT JOIN addresses a ON a.id = o.address_id
        LEFT JOIN payment_methods pm ON pm.id = o.payment_method_id
        LEFT JOIN order_status_catalog osc ON osc.id = o.order_status_id
        LEFT JOIN delivery d ON d.order_id = o.id
        LEFT JOIN delivery_status_catalog dsc ON dsc.id = d.delivery_status_id
        LEFT JOIN users du ON du.id = d.driver_user_id
        WHERE o.business_id = ?
          AND LOWER(TRIM(COALESCE(osc.name, ''))) NOT IN ('cancelado', 'cancelled')
        ORDER BY COALESCE(o.placed_at, o.created_at) DESC, o.id DESC
      `,
      [access.businessId],
    );

    if (!orderRows.length) {
      if (process.env.NODE_ENV !== "production") {
        console.log("[business/orders] no orders found", {
          businessId: access.businessId,
        });
      }
      return NextResponse.json({
        success: true,
        orders: [],
      });
    }

    const orderIds = orderRows.map((row) => Number(row.id));
    const placeholders = orderIds.map(() => "?").join(", ");
    const [itemRows] = await pool.query<OrderItemRow[]>(
      `
        SELECT
          oi.id,
          oi.order_id,
          oi.product_name_snapshot AS product_name,
          oi.quantity,
          oi.subtotal,
          oi.notes
        FROM order_items oi
        WHERE oi.order_id IN (${placeholders})
        ORDER BY oi.order_id ASC, oi.id ASC
      `,
      orderIds,
    );

    const itemsByOrder = new Map<number, OrderItemRow[]>();
    for (const item of itemRows) {
      const group = itemsByOrder.get(Number(item.order_id)) ?? [];
      group.push(item);
      itemsByOrder.set(Number(item.order_id), group);
    }

    const responseOrders = orderRows.map((row) => ({
      id: Number(row.id),
      businessId: Number(row.business_id),
      businessName: row.business_name,
      subtotal: Number(row.subtotal ?? 0),
      serviceFee: Number(row.service_fee ?? 0),
      deliveryFee: Number(row.delivery_fee ?? 0),
      total: Number(row.total_amount ?? 0),
      status: getOrderStatusLabel(row.status_name),
      statusCode: resolveCanonicalOrderStatus(row.status_name),
      placedAt: row.placed_at ?? row.created_at,
      customerName: row.customer_name ?? "Cliente",
      paymentMethod: row.payment_method ?? "Sin método",
      paymentReceiptUrl: row.payment_receipt_url ?? null,
      address: buildAddress(row),
      notes: row.customer_notes ?? "",
      deliveryUserId: Number(row.driver_user_id ?? 0) || null,
      deliveryName: row.delivery_name ?? null,
      deliveryPhone: row.delivery_phone ?? null,
      deliveryProfileImageUrl: row.delivery_profile_image_url ?? null,
      deliveryStatus: row.delivery_status_name ?? null,
      deliveryRequested:
        Boolean(row.delivery_id) && !row.delivery_status_is_final,
      items: (itemsByOrder.get(Number(row.id)) ?? []).map((item) => ({
        id: Number(item.id),
        name: item.product_name,
        quantity: Number(item.quantity ?? 0),
        total: Number(item.subtotal ?? 0),
        notes: item.notes ?? "",
      })),
    }));

    if (process.env.NODE_ENV !== "production") {
      console.log("[business/orders] payload", {
        businessId: access.businessId,
        totalOrders: responseOrders.length,
        orders: responseOrders.map((order) => ({
          id: order.id,
          status: order.status,
          statusCode: order.statusCode,
          paymentMethod: order.paymentMethod,
        })),
      });
    }

    return NextResponse.json({
      success: true,
      orders: responseOrders,
    });
  } catch (error) {
    console.error("Error GET /api/business/orders:", error);
    return NextResponse.json(
      {
        success: false,
        error: getFriendlyDatabaseErrorMessage(error),
        orders: [],
      },
      { status: 500 },
    );
  }
}
