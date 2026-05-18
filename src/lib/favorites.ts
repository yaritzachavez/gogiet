import type { Pool, PoolConnection, RowDataPacket } from "mysql2/promise";

import pool from "@/lib/db";
import {
  assertColumnsExist,
  assertIndexesExist,
  assertTablesExist,
} from "@/lib/runtime-schema";

type Queryable = Pool | PoolConnection;

export async function ensureFavoritesTable(executor: Queryable = pool) {
  await assertTablesExist(executor, ["favorites"]);
  await assertColumnsExist(executor, "favorites", [
    "id",
    "user_id",
    "favorite_type",
    "target_id",
    "created_at",
  ]);
  await assertIndexesExist(executor, "favorites", [
    "uk_favorites_unique",
    "idx_favorites_user_id",
  ]);
}
