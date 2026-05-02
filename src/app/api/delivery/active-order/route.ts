import type { RowDataPacket } from "mysql2/promise";
import { type NextRequest, NextResponse } from "next/server";

import { getAuthUser } from "@/lib/admin-security";
import pool, { logDbUsage } from "@/lib/db";
import { resolveDeliveryAccess } from "@/lib/delivery-access";

type ActiveOrderRow = RowDataPacket & {
  order_id: number;
  customer_name: string | null;
  customer_phone: string | null;
  street: string | null;
  external_number: string | null;
  internal_number: string | null;
  neighborhood: string | null;
  city: string | null;
  state: string | null;
  reference_notes: string | null;
  latitude: string | number | null;
  longitude: string | number | null;
  order_status: string | null;
  payment_method: string | null;
  payment_method_name: string | null;
  estimated_duration_min: number | null;
  delivery_notes: string | null;
  order_delivery_notes: string | null;
  delivery_status: string | null;
};

const ACTIVE_STATUS_PRIORITY = [
  "en_camino",
  "en_entrega",
  "recogido",
  "listo_para_recoger",
  "aceptado",
];

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
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, "_");
}

function buildStreet(parts: {
  street: string | null;
  external_number: string | null;
  internal_number: string | null;
}) {
  return [
    parts.street?.trim(),
    parts.external_number?.trim(),
    parts.internal_number?.trim()
      ? `Int. ${parts.internal_number.trim()}`
      : null,
  ]
    .filter(Boolean)
    .join(" ");
}

function buildFullAddress(row: ActiveOrderRow) {
  return [
    buildStreet(row),
    row.neighborhood?.trim(),
    row.city?.trim(),
    row.state?.trim(),
  ]
    .filter(Boolean)
    .join(", ");
}

function formatDeliveryStatus(value: unknown) {
  const normalized = normalizeStatus(value);

  if (normalized === "en_camino") return "En camino";
  if (normalized === "listo_para_recoger") return "Listo para recoger";
  if (normalized === "recogido") return "Recogido";
  if (normalized === "en_entrega") return "En entrega";

  return "Pendiente";
}

function sortByActivePriority(a: ActiveOrderRow, b: ActiveOrderRow) {
  const aIndex = ACTIVE_STATUS_PRIORITY.indexOf(
    normalizeStatus(a.order_status),
  );
  const bIndex = ACTIVE_STATUS_PRIORITY.indexOf(
    normalizeStatus(b.order_status),
  );
  const safeA = aIndex === -1 ? ACTIVE_STATUS_PRIORITY.length : aIndex;
  const safeB = bIndex === -1 ? ACTIVE_STATUS_PRIORITY.length : bIndex;

  return safeA - safeB;
}

export async function GET(req: NextRequest) {
  try {
    const authUser = getAuthUser(req);

    if (!authUser?.token) {
      return NextResponse.json(
        { success: false, error: "Token faltante", activeOrder: null },
        { status: 401 },
      );
    }

    if (!authUser?.user) {
      return NextResponse.json(
        { success: false, error: "Token inválido", activeOrder: null },
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
          activeOrder: null,
          order: null,
        },
        { status: 403 },
      );
    }

    logDbUsage("/api/delivery/active-order", {
      userId,
      email: access.email,
      role: access.roles,
    });

    const [orderRows] = await pool.query<ActiveOrderRow[]>(
      `
        SELECT
          o.id AS order_id,
          CONCAT(u.first_name, ' ', COALESCE(u.last_name, '')) AS customer_name,
          COALESCE(a.phone, u.phone) AS customer_phone,
          a.street,
          a.external_number,
          a.internal_number,
          a.neighborhood,
          a.city,
          a.state,
          a.reference_notes,
          a.latitude,
          a.longitude,
          osc.name AS order_status,
          o.payment_method AS payment_method,
          pm.name AS payment_method_name,
          d.estimated_duration_min,
          d.delivery_notes,
          o.customer_notes AS order_delivery_notes,
          dsc.name AS delivery_status
        FROM delivery d
        INNER JOIN orders o ON o.id = d.order_id
        INNER JOIN users u ON u.id = o.user_id
        INNER JOIN addresses a ON a.id = o.address_id
        LEFT JOIN order_status_catalog osc ON osc.id = o.order_status_id
        LEFT JOIN payment_methods pm ON pm.id = o.payment_method_id
        LEFT JOIN delivery_status_catalog dsc ON dsc.id = d.delivery_status_id
        WHERE d.driver_user_id = ?
          AND COALESCE(dsc.is_final, 0) = 0
        ORDER BY o.created_at DESC
      `,
      [userId],
    );

    const activeRows = orderRows
      .filter(
        (row) =>
          normalizeStatus(row.delivery_status) !== "pendiente_aceptacion" &&
          !EXCLUDED_ORDER_STATUSES.has(normalizeStatus(row.order_status)),
      )
      .sort(sortByActivePriority);

    if (!activeRows.length) {
      return NextResponse.json({
        success: true,
        activeOrder: null,
        order: null,
      });
    }

    const activeOrder = activeRows[0];

    const payload = {
      id: Number(activeOrder.order_id),
      folio: `FG-${String(activeOrder.order_id).padStart(4, "0")}`,
      customerName: activeOrder.customer_name ?? "Cliente",
      customerPhone: activeOrder.customer_phone ?? "",
      fullAddress: buildFullAddress(activeOrder),
      zoneName: activeOrder.neighborhood ?? "Sin zona",
      city: [activeOrder.city, activeOrder.state].filter(Boolean).join(", "),
      references:
        activeOrder.reference_notes ||
        activeOrder.delivery_notes ||
        activeOrder.order_delivery_notes ||
        "",
      status: formatDeliveryStatus(activeOrder.order_status),
      latitude:
        activeOrder.latitude == null ? null : Number(activeOrder.latitude),
      longitude:
        activeOrder.longitude == null ? null : Number(activeOrder.longitude),
      paymentMethod:
        activeOrder.payment_method || activeOrder.payment_method_name || "",
    };

    return NextResponse.json({
      success: true,
      activeOrder: payload,
      order: payload,
    });
  } catch (error) {
    console.error("Error GET /api/delivery/active-order:", error);
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "No se pudo cargar la orden activa del repartidor.",
        activeOrder: null,
      },
      { status: 500 },
    );
  }
}
