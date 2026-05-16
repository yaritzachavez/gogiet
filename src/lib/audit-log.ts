import type { Pool, PoolConnection, ResultSetHeader } from "mysql2/promise";

import pool from "@/lib/db";

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
  await conn.query(
    `
      CREATE TABLE IF NOT EXISTS audit_logs (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        action VARCHAR(120) NOT NULL,
        resource_type VARCHAR(80) NOT NULL,
        resource_id VARCHAR(120) NOT NULL,
        old_value MEDIUMTEXT NULL,
        new_value MEDIUMTEXT NULL,
        ip VARCHAR(120) NULL,
        user_agent VARCHAR(255) NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_audit_logs_user_id (user_id),
        INDEX idx_audit_logs_action (action),
        INDEX idx_audit_logs_resource (resource_type, resource_id)
      )
    `,
  );
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
