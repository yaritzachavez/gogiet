import type { Pool, PoolConnection } from "mysql2/promise";

import {
  assertColumnsExist,
  assertIndexesExist,
  assertTablesExist,
} from "@/lib/runtime-schema";

type Queryable = Pool | PoolConnection;

export async function ensureDeliveryEvidenceRuntimeSchema(conn: Queryable) {
  await assertTablesExist(conn, ["delivery_evidence"]);
  await assertColumnsExist(conn, "delivery_evidence", [
    "id",
    "delivery_id",
    "order_id",
    "driver_user_id",
    "photo_url",
    "note",
    "latitude",
    "longitude",
    "created_at",
    "updated_at",
  ]);
  await assertIndexesExist(conn, "delivery_evidence", [
    "uk_delivery_evidence_delivery_id",
    "idx_delivery_evidence_order_id",
    "idx_delivery_evidence_driver_user_id",
  ]);
}
