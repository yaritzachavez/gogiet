import type { RowDataPacket } from "mysql2/promise";
import { type NextRequest, NextResponse } from "next/server";

import { getAuthUser } from "@/lib/admin-security";
import pool, { logDbUsage } from "@/lib/db";
import { resolveDeliveryAccess } from "@/lib/delivery-access";

type DeliveryOrderRow = RowDataPacket & {
  order_id: number;
  business_name: string;
  total_amount: string | number | null;
  customer_name: string | null;
  customer_phone: string | null;
  street: string | null;
  external_number: string | null;
  internal_number: string | null;
  neighborhood: string | null;
  city: string | null;
  state: string | null;
  reference_notes: string | null;
  payment_method: string | null;
  order_delivery_notes: string | null;
  delivery_notes: string | null;
  order_status: string | null;
  delivery_status: string | null;
  estimated_duration_min: number | null;
};

type OrderItemRow = RowDataPacket & {
  id: number;
  order_id: number;
  product_name: string;
  quantity: number;
  unit_price: string | number;
  subtotal: string | number;
  notes: string | null;
};

const EXCLUDED_ORDER_STATUSES = new Set([
  "entregado",
  "pedido_entregado",
  "cancelado",
  "pago_rechazado",
]);

function normalizeStatus(value: unknown) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function formatDeliveryStatus(value: unknown) {
  const normalized = normalizeStatus(value).replace(/\s+/g, "_");

  if (normalized === "en_camino") return "En camino";
  if (normalized === "listo_para_recoger") return "Listo para recoger";
  if (normalized === "aceptado") return "Pendiente";
  if (normalized === "pendiente_aceptacion") return "Pendiente";
  if (
    normalized === "pendiente" ||
    normalized === "por_validar_pago" ||
    normalized === "pago_validado" ||
    normalized === "preparando"
  ) {
    return "Pendiente";
  }

  return "Pendiente";
}

function requiresCourierResponse(value: unknown) {
  return normalizeStatus(value) === "pendiente_aceptacion";
}

function buildAddress(parts: {
  street: string | null;
  external_number: string | null;
  internal_number: string | null;
}) {
  const pieces = [
    parts.street?.trim(),
    parts.external_number?.trim(),
    parts.internal_number ? `Int. ${parts.internal_number.trim()}` : null,
  ].filter(Boolean);

  return pieces.join(" ");
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

    const userId = authUser.user.id;
    const access = await resolveDeliveryAccess(userId);

    if (!access.allowed) {
      return NextResponse.json(
        {
          success: false,
          error: "No autorizado para acceder al panel de repartidor",
          orders: [],
        },
        { status: 403 },
      );
    }

    logDbUsage("/api/delivery/orders", {
      userId,
      email: access.email,
      role: access.roles,
    });

    const [ordersRows] = await pool.query<DeliveryOrderRow[]>(
      `
        SELECT
          o.id AS order_id,
          b.name AS business_name,
          o.total_amount,
          CONCAT(u.first_name, ' ', COALESCE(u.last_name, '')) AS customer_name,
          COALESCE(a.phone, u.phone) AS customer_phone,
          a.street,
          a.external_number,
          a.internal_number,
          a.neighborhood,
          a.city,
          a.state,
          a.reference_notes,
          COALESCE(o.payment_method, pm.name) AS payment_method,
          o.customer_notes AS order_delivery_notes,
          d.delivery_notes,
          osc.name AS order_status,
          dsc.name AS delivery_status,
          d.estimated_duration_min
        FROM delivery d
        INNER JOIN orders o ON o.id = d.order_id
        INNER JOIN business b ON b.id = o.business_id
        INNER JOIN users u ON u.id = o.user_id
        INNER JOIN addresses a ON a.id = o.address_id
        LEFT JOIN payment_methods pm ON pm.id = o.payment_method_id
        LEFT JOIN order_status_catalog osc ON osc.id = o.order_status_id
        LEFT JOIN delivery_status_catalog dsc ON dsc.id = d.delivery_status_id
        WHERE d.driver_user_id = ?
          AND COALESCE(dsc.is_final, 0) = 0
        ORDER BY o.created_at DESC
      `,
      [userId],
    );

    const activeOrdersRows = ordersRows.filter(
      (row) => !EXCLUDED_ORDER_STATUSES.has(normalizeStatus(row.order_status)),
    );

    if (!activeOrdersRows.length) {
      return NextResponse.json({
        success: true,
        orders: [],
      });
    }

    const orderIds = activeOrdersRows.map((row) => Number(row.order_id));
    const placeholders = orderIds.map(() => "?").join(", ");
    const [itemsRows] = await pool.query<OrderItemRow[]>(
      `
        SELECT
          oi.id,
          oi.order_id,
          oi.product_name_snapshot AS product_name,
          oi.quantity,
          oi.unit_price,
          oi.subtotal,
          oi.notes
        FROM order_items oi
        WHERE oi.order_id IN (${placeholders})
        ORDER BY oi.order_id ASC, oi.id ASC
      `,
      orderIds,
    );

    const itemsByOrder = new Map<number, OrderItemRow[]>();
    for (const item of itemsRows) {
      const key = Number(item.order_id);
      const group = itemsByOrder.get(key) ?? [];
      group.push(item);
      itemsByOrder.set(key, group);
    }

    console.log("[api/delivery/orders] respuesta panel repartidor:", {
      userId,
      totalAssignments: activeOrdersRows.length,
      orderIds: activeOrdersRows.map((row) => Number(row.order_id)),
      assignmentsVisibles: activeOrdersRows.map((row) => ({
        orderId: Number(row.order_id),
        orderStatus: row.order_status,
        deliveryStatus: row.delivery_status,
      })),
    });

    return NextResponse.json({
      success: true,
      orders: activeOrdersRows.map((row) => ({
        id: Number(row.order_id),
        folio: `FG-${String(row.order_id).padStart(4, "0")}`,
        businessName: row.business_name,
        total: Number(row.total_amount ?? 0),
        customerName: row.customer_name ?? "Cliente",
        customerPhone: row.customer_phone ?? "",
        address: buildAddress(row),
        zoneName: row.neighborhood ?? "Sin zona",
        paymentMethod: row.payment_method ?? "Sin método",
        deliveryNotes: row.delivery_notes || row.order_delivery_notes || "",
        status: formatDeliveryStatus(row.delivery_status ?? row.order_status),
        assignmentStatus: row.delivery_status ?? "",
        canRespond: requiresCourierResponse(row.delivery_status),
        eta: row.estimated_duration_min
          ? `${row.estimated_duration_min} min`
          : "Por confirmar",
        items: (itemsByOrder.get(Number(row.order_id)) ?? []).map((item) => ({
          id: Number(item.id),
          name: item.product_name,
          quantity: Number(item.quantity ?? 0),
          unitPrice: Number(item.unit_price ?? 0),
          totalPrice: Number(item.subtotal ?? 0),
          notes: item.notes ?? "",
        })),
        addressDetail: {
          street: buildAddress(row),
          neighborhood: row.neighborhood ?? "Sin colonia",
          city: [row.city, row.state].filter(Boolean).join(", "),
          references: row.reference_notes ?? "",
        },
      })),
    });
  } catch (error) {
    console.error("Error GET /api/delivery/orders:", error);
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "No se pudieron cargar las entregas del repartidor.",
        orders: [],
      },
      { status: 500 },
    );
  }
}
