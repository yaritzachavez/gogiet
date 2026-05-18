import type { Pool, PoolConnection, ResultSetHeader } from "mysql2/promise";

import pool from "@/lib/db";
import {
  assertColumnsExist,
  assertIndexesExist,
  assertTablesExist,
} from "@/lib/runtime-schema";

type Queryable = Pool | PoolConnection;

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
  await assertIndexesExist(conn, "audit_logs", [
    "idx_audit_logs_user_id",
    "idx_audit_logs_action",
    "idx_audit_logs_resource",
  ]);
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
