import type { Pool, PoolConnection, RowDataPacket } from "mysql2/promise";

import pool from "@/lib/db";
import { assertTablesExist } from "@/lib/runtime-schema";

type Queryable = Pool | PoolConnection;

type ColumnRow = RowDataPacket & {
  column_name: string;
};

type MysqlDuplicateColumnError = Error & {
  code?: string;
  errno?: number;
};

let cachedDriverStatusColumns: DriverStatusColumns | null = null;

export type DriverOperationalStatus =
  | "ACTIVE"
  | "OFFLINE"
  | "RESTING"
  | "SUSPENDED"
  | "DISABLED";

export type DriverStatusColumns = {
  hasDriverStatus: boolean;
  hasDriverStatusReason: boolean;
  hasDriverActiveSince: boolean;
};

export const DRIVER_STATUS_LABELS: Record<DriverOperationalStatus, string> = {
  ACTIVE: "Activo",
  OFFLINE: "Desconectado",
  RESTING: "En descanso",
  SUSPENDED: "Suspendido",
  DISABLED: "Desactivado",
};

const VALID_DRIVER_STATUSES = new Set<DriverOperationalStatus>([
  "ACTIVE",
  "OFFLINE",
  "RESTING",
  "SUSPENDED",
  "DISABLED",
]);

export async function getDriverStatusColumns(
  executor: Queryable = pool,
): Promise<DriverStatusColumns> {
  if (executor === pool && cachedDriverStatusColumns) {
    return cachedDriverStatusColumns;
  }

  await assertTablesExist(executor, ["users"]);

  const [rows] = await executor.query<ColumnRow[]>(
    `
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = DATABASE()
        AND table_name = 'users'
        AND column_name IN (
          'driver_status',
          'driver_status_reason',
          'driver_active_since'
        )
    `,
  );

  const columnNames = new Set(
    rows.map((row) => String(row.column_name).toLowerCase()),
  );

  const columns = {
    hasDriverStatus: columnNames.has("driver_status"),
    hasDriverStatusReason: columnNames.has("driver_status_reason"),
    hasDriverActiveSince: columnNames.has("driver_active_since"),
  };

  if (executor === pool) {
    cachedDriverStatusColumns = columns;
  }

  return columns;
}

export async function ensureDriverStatusColumns(executor: Queryable = pool) {
  const columns = await getDriverStatusColumns(executor);

  async function addColumnIfMissing(
    hasColumn: boolean,
    statement: string,
    columnName: string,
  ) {
    if (hasColumn) return;

    try {
      await executor.query(statement);
      cachedDriverStatusColumns = null;
    } catch (error) {
      const mysqlError = error as MysqlDuplicateColumnError;

      if (
        mysqlError?.code === "ER_DUP_FIELDNAME" ||
        mysqlError?.errno === 1060 ||
        String(mysqlError?.message ?? "").includes(
          `Duplicate column name '${columnName}'`,
        )
      ) {
        cachedDriverStatusColumns = null;
        return;
      }

      throw error;
    }
  }

  if (!columns.hasDriverStatus) {
    await addColumnIfMissing(
      columns.hasDriverStatus,
      `
        ALTER TABLE users
        ADD COLUMN driver_status VARCHAR(20) NULL DEFAULT 'ACTIVE'
      `,
      "driver_status",
    );
  }

  if (!columns.hasDriverStatusReason) {
    await addColumnIfMissing(
      columns.hasDriverStatusReason,
      `
        ALTER TABLE users
        ADD COLUMN driver_status_reason TEXT NULL
      `,
      "driver_status_reason",
    );
  }

  if (!columns.hasDriverActiveSince) {
    await addColumnIfMissing(
      columns.hasDriverActiveSince,
      `
        ALTER TABLE users
        ADD COLUMN driver_active_since DATETIME NULL
      `,
      "driver_active_since",
    );
  }

  const ensuredColumns = {
    hasDriverStatus: true,
    hasDriverStatusReason: true,
    hasDriverActiveSince: true,
  };

  if (executor === pool) {
    cachedDriverStatusColumns = ensuredColumns;
  }

  return ensuredColumns;
}

export function normalizeDriverStatus(
  value: unknown,
  isAvailable = false,
): DriverOperationalStatus {
  const normalized = String(value ?? "")
    .trim()
    .toUpperCase();
  const alias =
    normalized === "DISCONNECTED" || normalized === "DESCONECTADO"
      ? "OFFLINE"
      : normalized;

  if (VALID_DRIVER_STATUSES.has(alias as DriverOperationalStatus)) {
    return alias as DriverOperationalStatus;
  }

  return isAvailable ? "ACTIVE" : "RESTING";
}

export function driverStatusToLabel(status: DriverOperationalStatus) {
  return DRIVER_STATUS_LABELS[status];
}

export function isDriverAvailableStatus(status: DriverOperationalStatus) {
  return status === "ACTIVE";
}
