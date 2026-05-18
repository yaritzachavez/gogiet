import type { Pool, PoolConnection } from "mysql2/promise";

import { assertColumnsExist, assertTablesExist } from "@/lib/runtime-schema";

type Queryable = Pool | PoolConnection;

export async function ensureOrdersRuntimeSchema(conn: Queryable) {
  await assertTablesExist(conn, ["orders"]);
  await assertColumnsExist(conn, "orders", [
    "id",
    "user_id",
    "cart_id",
    "business_id",
    "driver_id",
    "address_id",
    "payment_method_id",
    "payment_method",
    "payment_receipt_url",
    "comprobante_pago_url",
    "order_status_id",
    "subtotal",
    "terminal_fee",
    "delivery_fee",
    "service_fee",
    "platform_fee",
    "driver_fee",
    "tip_amount",
    "discount_amount",
    "total_amount",
    "customer_notes",
    "request_fingerprint",
    "order_snapshot_json",
    "placed_at",
    "confirmed_at",
    "delivered_at",
    "cancelled_at",
    "created_at",
    "updated_at",
  ]);
}

export async function ensureOrderItemsRuntimeSchema(conn: Queryable) {
  await assertTablesExist(conn, ["order_items"]);
  await assertColumnsExist(conn, "order_items", [
    "id",
    "order_id",
    "product_id",
    "product_name_snapshot",
    "product_snapshot_json",
    "unit_price",
    "quantity",
    "subtotal",
    "notes",
    "created_at",
    "updated_at",
  ]);
}

export async function ensureAdminMessagesRuntimeSchema(conn: Queryable) {
  await assertTablesExist(conn, ["admin_messages"]);
  await assertColumnsExist(conn, "admin_messages", [
    "id",
    "order_id",
    "user_id",
    "type",
    "message",
    "file_url",
    "created_at",
  ]);
}
