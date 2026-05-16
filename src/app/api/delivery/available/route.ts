import type { RowDataPacket } from "mysql2/promise";
import { type NextRequest, NextResponse } from "next/server";

import { getAuthUser } from "@/lib/admin-security";
import pool, { logDbUsage } from "@/lib/db";
import { resolveDeliveryAccess } from "@/lib/delivery-access";

type AvailableDeliveryRow = RowDataPacket & {
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

function normalizeStatus(value: unknown) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, "_");
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
        { success: false, error: "Token faltante", deliveries: [] },
        { status: 401 },
      );
    }

    if (!authUser?.user) {
      return NextResponse.json(
        { success: false, error: "Token inválido", deliveries: [] },
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
          deliveries: [],
          orders: [],
        },
        { status: 403 },
      );
    }

    logDbUsage("/api/delivery/available", {
      userId,
      email: access.email,
      role: access.roles,
    });

    const [availableRows] = await pool.query<AvailableDeliveryRow[]>(
      `
        SELECT
          o.id AS order_id,
          b.name AS business_name,
          o.total_amount,
          TRIM(CONCAT_WS(' ', u.first_name, u.last_name)) AS customer_name,
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
        WHERE d.driver_user_id IS NULL
          AND COALESCE(dsc.is_final, 0) = 0
          AND LOWER(
            REPLACE(
              REPLACE(
                REPLACE(
                  REPLACE(COALESCE(dsc.name, ''), 'á', 'a'),
                  'é',
                  'e'
                ),
                'í',
                'i'
              ),
              ' ',
              '_'
            )
          ) IN ('pending_driver', 'disponible', 'available')
          AND LOWER(
            REPLACE(
              REPLACE(
                REPLACE(
                  REPLACE(COALESCE(osc.name, ''), 'á', 'a'),
                  'é',
                  'e'
                ),
                'í',
                'i'
              ),
              ' ',
              '_'
            )
          ) IN ('listo_para_recoger', 'ready_for_pickup')
        ORDER BY d.created_at DESC, o.created_at DESC
      `,
    );

    if (!availableRows.length) {
      console.log(
        "[api/delivery/available] Pedidos disponibles encontrados para repartidor:",
        [],
      );

      return NextResponse.json({
        success: true,
        deliveries: [],
        orders: [],
      });
    }

    const orderIds = availableRows.map((row) => Number(row.order_id));
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

    const deliveries = availableRows.map((row) => ({
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
      status:
        normalizeStatus(row.order_status) === "listo_para_recoger"
          ? "Listo para recoger"
          : "Pendiente",
      assignmentStatus: row.delivery_status ?? "pending_driver",
      canRespond: true,
      canReject: false,
      isAvailableDelivery: true,
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
    }));

    console.log(
      "[api/delivery/available] Pedidos disponibles encontrados para repartidor:",
      deliveries.map((delivery) => ({
        orderId: delivery.id,
        businessName: delivery.businessName,
        assignmentStatus: delivery.assignmentStatus,
      })),
    );

    return NextResponse.json({
      success: true,
      deliveries,
      orders: deliveries,
    });
  } catch (error) {
    console.error("Error GET /api/delivery/available:", error);
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "No se pudieron cargar las entregas disponibles.",
        deliveries: [],
      },
      { status: 500 },
    );
  }
}
