import type { RowDataPacket } from "mysql2/promise";

import pool from "@/lib/db";

type TableRow = RowDataPacket & {
  table_name: string;
};

function normalizeTableNames(tableNames: string[]) {
  return Array.from(
    new Set(
      tableNames
        .map((tableName) => String(tableName ?? "").trim())
        .filter((tableName) => tableName.length > 0),
    ),
  );
}

export async function getExistingTables(tableNames: string[]) {
  const normalizedNames = normalizeTableNames(tableNames);

  if (normalizedNames.length === 0) {
    return new Set<string>();
  }

  const placeholders = normalizedNames.map(() => "?").join(", ");
  const [rows] = await pool.query<TableRow[]>(
    `
      SELECT TABLE_NAME AS table_name
      FROM INFORMATION_SCHEMA.TABLES
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME IN (${placeholders})
    `,
    normalizedNames,
  );

  return new Set(
    rows.map((row) => String(row.table_name ?? "").trim()).filter(Boolean),
  );
}

export async function getFirstExistingTable(tableNames: string[]) {
  const normalizedNames = normalizeTableNames(tableNames);
  const existingTables = await getExistingTables(normalizedNames);

  return (
    normalizedNames.find((tableName) => existingTables.has(tableName)) ?? null
  );
}
