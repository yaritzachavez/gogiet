import type { Pool, PoolConnection, RowDataPacket } from "mysql2/promise";

import pool from "@/lib/db";
import {
  getExistingColumns,
  getShippingFeeSqlExpression,
  pickFirstExistingColumn,
  SHIPPING_FEE_COLUMN_CANDIDATES,
} from "@/lib/delivery-fees";

type Queryable = Pool | PoolConnection;

type CurrentDriverDeliveryRow = RowDataPacket & {
  delivery_id: number | null;
  order_id: number;
  delivery_driver_user_id: number | null;
  order_driver_id: number | null;
  business_name: string | null;
  business_address: string | null;
  business_district: string | null;
  business_city: string | null;
  total_amount: string | number | null;
  shipping_fee_amount: string | number | null;
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
  delivery_status_is_final: number | boolean | null;
  order_delivered_at: string | null;
  delivery_delivered_at: string | null;
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

const FINAL_ORDER_STATUSES = new Set([
  "delivered",
  "entregado",
  "pedido_entregado",
  "cancelled",
  "canceled",
  "cancelado",
  "payment_failed",
  "pago_rechazado",
  "rejected",
  "rechazado",
  "completed",
  "completado",
]);

const FINAL_DELIVERY_STATUSES = new Set([
  "completado",
  "completed",
  "entregado",
  "delivered",
  "rechazado",
  "rejected",
  "cancelado",
  "cancelled",
  "canceled",
]);

export type CurrentDriverDelivery = {
  id: number;
  deliveryId: number | null;
  driverId: number | null;
  driverUserId: number | null;
  orderDriverId: number | null;
  folio: string;
  businessName: string;
  businessAddress: string;
  total: number;
  shippingFee: number;
  customerName: string;
  customerPhone: string;
  address: string;
  zoneName: string;
  paymentMethod: string;
  deliveryNotes: string;
  customerReference: string;
  status: string;
  assignmentStatus: string;
  canRespond: boolean;
  eta: string;
  items: Array<{
    id: number;
    name: string;
    quantity: number;
    unitPrice: number;
    totalPrice: number;
    notes: string;
  }>;
  addressDetail: {
    street: string;
    neighborhood: string;
    city: string;
    references: string;
  };
};

function normalizeStatus(value: unknown) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, "_");
}

function formatDeliveryStatus(row: CurrentDriverDeliveryRow) {
  const normalized = normalizeStatus(row.delivery_status ?? row.order_status);

  if (normalized === "en_camino") return "En camino";
  if (normalized === "on_the_way") return "En camino";
  if (normalized === "en_camino_negocio") return "En camino al negocio";
  if (normalized === "llegue_al_negocio") return "Llegué al negocio";
  if (normalized === "ready_for_pickup") return "Listo para recoger";
  if (normalized === "listo_para_recoger") return "Listo para recoger";
  if (normalized === "recogido" || normalized === "picked_up") {
    return "Recogido";
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
  return [
    parts.street?.trim(),
    parts.external_number?.trim(),
    parts.internal_number ? `Int. ${parts.internal_number.trim()}` : null,
  ]
    .filter(Boolean)
    .join(" ");
}

function isActiveDriverDelivery(row: CurrentDriverDeliveryRow) {
  const orderStatus = normalizeStatus(row.order_status);
  const deliveryStatus = normalizeStatus(row.delivery_status);
  const isFinalByCatalog = Boolean(row.delivery_status_is_final);

  return (
    !row.order_delivered_at &&
    !row.delivery_delivered_at &&
    !isFinalByCatalog &&
    !FINAL_ORDER_STATUSES.has(orderStatus) &&
    !FINAL_DELIVERY_STATUSES.has(deliveryStatus)
  );
}

export async function getCurrentDriverDeliveries(
  userId: number,
  executor: Queryable = pool,
) {
  const orderColumns = await getExistingColumns(
    executor,
    "orders",
    SHIPPING_FEE_COLUMN_CANDIDATES,
  );
  const shippingFeeColumn = pickFirstExistingColumn(
    orderColumns,
    SHIPPING_FEE_COLUMN_CANDIDATES,
  );
  const shippingFeeExpression = getShippingFeeSqlExpression(shippingFeeColumn);

  const [rows] = await executor.query<CurrentDriverDeliveryRow[]>(
    `
      SELECT
        d.id AS delivery_id,
        o.id AS order_id,
        d.driver_user_id AS delivery_driver_user_id,
        o.driver_id AS order_driver_id,
        COALESCE(b.name, 'Negocio') AS business_name,
        b.address AS business_address,
        b.district AS business_district,
        b.city AS business_city,
        o.total_amount,
        ${shippingFeeExpression} AS shipping_fee_amount,
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
        COALESCE(dsc.is_final, 0) AS delivery_status_is_final,
        o.delivered_at AS order_delivered_at,
        d.delivered_at AS delivery_delivered_at,
        d.estimated_duration_min
      FROM orders o
      LEFT JOIN delivery d ON d.order_id = o.id
      LEFT JOIN business b ON b.id = o.business_id
      LEFT JOIN users u ON u.id = o.user_id
      LEFT JOIN addresses a ON a.id = o.address_id
      LEFT JOIN payment_methods pm ON pm.id = o.payment_method_id
      LEFT JOIN order_status_catalog osc ON osc.id = o.order_status_id
      LEFT JOIN delivery_status_catalog dsc ON dsc.id = d.delivery_status_id
      WHERE d.driver_user_id = ?
        OR o.driver_id = ?
      ORDER BY o.created_at DESC, d.id DESC
    `,
    [userId, userId],
  );

  const activeRows = rows.filter(isActiveDriverDelivery);
  const orderIds = activeRows.map((row) => Number(row.order_id));
  const itemsByOrder = new Map<number, OrderItemRow[]>();

  if (orderIds.length > 0) {
    const placeholders = orderIds.map(() => "?").join(", ");
    const [itemsRows] = await executor.query<OrderItemRow[]>(
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

    for (const item of itemsRows) {
      const key = Number(item.order_id);
      const group = itemsByOrder.get(key) ?? [];
      group.push(item);
      itemsByOrder.set(key, group);
    }
  }

  const activeDeliveries: CurrentDriverDelivery[] = activeRows.map((row) => {
    const street = buildAddress(row);
    const driverId =
      row.delivery_driver_user_id === null ||
      row.delivery_driver_user_id === undefined
        ? row.order_driver_id === null || row.order_driver_id === undefined
          ? null
          : Number(row.order_driver_id)
        : Number(row.delivery_driver_user_id);

    return {
      id: Number(row.order_id),
      deliveryId:
        row.delivery_id === null || row.delivery_id === undefined
          ? null
          : Number(row.delivery_id),
      driverId,
      driverUserId:
        row.delivery_driver_user_id === null ||
        row.delivery_driver_user_id === undefined
          ? null
          : Number(row.delivery_driver_user_id),
      orderDriverId:
        row.order_driver_id === null || row.order_driver_id === undefined
          ? null
          : Number(row.order_driver_id),
      folio: `FG-${String(row.order_id).padStart(4, "0")}`,
      businessName: row.business_name ?? "Negocio",
      businessAddress: [
        row.business_address,
        row.business_district,
        row.business_city,
      ]
        .filter(Boolean)
        .join(", "),
      total: Number(row.total_amount ?? 0),
      shippingFee: Number(row.shipping_fee_amount ?? 0),
      customerName: row.customer_name || "Cliente",
      customerPhone: row.customer_phone ?? "",
      address: street,
      zoneName: row.neighborhood ?? "Sin zona",
      paymentMethod: row.payment_method ?? "Sin método",
      deliveryNotes: row.delivery_notes || row.order_delivery_notes || "",
      customerReference: row.reference_notes ?? "",
      status: formatDeliveryStatus(row),
      assignmentStatus: row.delivery_status ?? row.order_status ?? "",
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
        street,
        neighborhood: row.neighborhood ?? "Sin colonia",
        city: [row.city, row.state].filter(Boolean).join(", "),
        references: row.reference_notes ?? "",
      },
    };
  });

  console.log("[DELIVERY IDENTITY]", {
    sessionUserId: userId,
    matchedRows: rows.map((row) => ({
      orderId: Number(row.order_id),
      deliveryId:
        row.delivery_id === null || row.delivery_id === undefined
          ? null
          : Number(row.delivery_id),
      deliveryDriverUserId: row.delivery_driver_user_id,
      orderDriverId: row.order_driver_id,
      orderStatus: row.order_status,
      deliveryStatus: row.delivery_status,
      deliveryStatusIsFinal: row.delivery_status_is_final,
      orderDeliveredAt: row.order_delivered_at,
      deliveryDeliveredAt: row.delivery_delivered_at,
    })),
  });

  console.log("[DELIVERY ACTIVE QUERY RESULT]", {
    count: activeDeliveries.length,
    orders: activeDeliveries.map((order) => ({
      id: order.id,
      status: order.status,
      assignmentStatus: order.assignmentStatus,
      deliveryId: order.deliveryId,
      driverUserId: order.driverUserId,
      orderDriverId: order.orderDriverId,
    })),
  });

  return {
    activeDeliveries,
    rawRows: rows,
  };
}
