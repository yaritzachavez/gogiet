import type { RowDataPacket } from "mysql2/promise";

import pool from "@/lib/db";
import {
  assertColumnsExist,
  assertTablesExist,
  RuntimeSchemaError,
} from "@/lib/runtime-schema";

type AddressIndexRow = RowDataPacket & {
  Key_name?: string;
  Column_name?: string;
};

async function ensureAddressesIndexes() {
  const [rows] = await pool.query<AddressIndexRow[]>(
    "SHOW INDEX FROM addresses",
  );
  const columnsByIndex = new Map<string, Set<string>>();

  for (const row of rows) {
    const keyName = String(row.Key_name ?? "").trim();
    const columnName = String(row.Column_name ?? "")
      .trim()
      .toLowerCase();

    if (!keyName || !columnName) {
      continue;
    }

    if (!columnsByIndex.has(keyName)) {
      columnsByIndex.set(keyName, new Set());
    }

    columnsByIndex.get(keyName)?.add(columnName);
  }

  const hasUserIdIndex = Array.from(columnsByIndex.values()).some(
    (columns) => columns.size === 1 && columns.has("user_id"),
  );
  const hasStatusIdIndex = Array.from(columnsByIndex.values()).some(
    (columns) => columns.size === 1 && columns.has("status_id"),
  );
  const hasIsDefaultIndex = Array.from(columnsByIndex.values()).some(
    (columns) => columns.size === 1 && columns.has("is_default"),
  );

  const missingIndexes = [
    !hasUserIdIndex ? "user_id" : null,
    !hasStatusIdIndex ? "status_id" : null,
    !hasIsDefaultIndex ? "is_default" : null,
  ].filter(Boolean) as string[];

  if (missingIndexes.length > 0) {
    throw new RuntimeSchemaError(
      `Faltan índices equivalentes en addresses: ${missingIndexes.join(", ")}.`,
    );
  }
}

export async function ensureAddressesTable() {
  await assertTablesExist(pool, ["addresses"]);
  await assertColumnsExist(pool, "addresses", [
    "user_id",
    "label",
    "recipient_name",
    "phone",
    "street",
    "external_number",
    "internal_number",
    "neighborhood",
    "city",
    "state",
    "postal_code",
    "reference_notes",
    "latitude",
    "longitude",
    "is_default",
    "status_id",
    "created_at",
    "updated_at",
  ]);
  await ensureAddressesIndexes();
}
