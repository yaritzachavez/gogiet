import type {
  Pool,
  PoolConnection,
  ResultSetHeader,
  RowDataPacket,
} from "mysql2/promise";

import pool from "@/lib/db";
import {
  assertColumnsExist,
  assertTablesExist,
  RuntimeSchemaError,
} from "@/lib/runtime-schema";

type Queryable = Pool | PoolConnection;
type AuditLogIndexRow = RowDataPacket & {
  Key_name?: string;
  Column_name?: string;
};

export type AuditLogInput = {
  userId: number;
  action: string;
  resourceType: string;
  resourceId: string | number;
  oldValue?: unknown;
  newValue?: unknown;
  ip?: string | null;
  userAgent?: string | null;
};

async function ensureAuditLogsIndexes(conn: Queryable) {
  const [rows] = await conn.query<AuditLogIndexRow[]>(
    "SHOW INDEX FROM audit_logs",
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
  const hasActionIndex = Array.from(columnsByIndex.values()).some(
    (columns) => columns.size === 1 && columns.has("action"),
  );
  const hasResourceTypeResourceIdIndex = Array.from(
    columnsByIndex.values(),
  ).some(
    (columns) =>
      columns.size === 2 &&
      columns.has("resource_type") &&
      columns.has("resource_id"),
  );

  const missingIndexes = [
    !hasUserIdIndex ? "user_id" : null,
    !hasActionIndex ? "action" : null,
    !hasResourceTypeResourceIdIndex ? "resource_type,resource_id" : null,
  ].filter(Boolean) as string[];

  if (missingIndexes.length > 0) {
    throw new RuntimeSchemaError(
      `Faltan índices equivalentes en audit_logs: ${missingIndexes.join(", ")}.`,
    );
  }
}

export async function ensureAuditLogsTable(conn: Queryable = pool) {
  await assertTablesExist(conn, ["audit_logs"]);
  await assertColumnsExist(conn, "audit_logs", [
    "id",
    "user_id",
    "action",
    "resource_type",
    "resource_id",
    "old_value",
    "new_value",
    "ip",
    "user_agent",
    "created_at",
  ]);
  await ensureAuditLogsIndexes(conn);
}

export async function recordAuditLog(
  input: AuditLogInput,
  conn: Queryable = pool,
) {
  await ensureAuditLogsTable(conn);

  await conn.query<ResultSetHeader>(
    `
      INSERT INTO audit_logs (
        user_id,
        action,
        resource_type,
        resource_id,
        old_value,
        new_value,
        ip,
        user_agent,
        created_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW())
    `,
    [
      input.userId,
      input.action,
      input.resourceType,
      String(input.resourceId),
      input.oldValue == null ? null : JSON.stringify(input.oldValue),
      input.newValue == null ? null : JSON.stringify(input.newValue),
      input.ip ?? null,
      input.userAgent ?? null,
    ],
  );
}
