import type { Pool, PoolConnection, RowDataPacket } from "mysql2/promise";

import pool from "@/lib/db";
import { assertTablesExist } from "@/lib/runtime-schema";

type Queryable = Pool | PoolConnection;

type ColumnRow = RowDataPacket & {
  column_name: string;
};

export type DriverOperationalStatus =
  | "ACTIVE"
  | "OFFLINE"
  | "RESTING"
  | "SUSPENDED"
  | "DISABLED";

export type DriverStatusColumns = {
  hasDriverStatus: boolean;
  hasDriverStatusReason: boolean;
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
  await assertTablesExist(executor, ["users"]);

  const [rows] = await executor.query<ColumnRow[]>(
    `
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = DATABASE()
        AND table_name = 'users'
        AND column_name IN ('driver_status', 'driver_status_reason')
    `,
  );

  const columnNames = new Set(
    rows.map((row) => String(row.column_name).toLowerCase()),
  );

  return {
    hasDriverStatus: columnNames.has("driver_status"),
    hasDriverStatusReason: columnNames.has("driver_status_reason"),
  };
}

export async function ensureDriverStatusColumns(executor: Queryable = pool) {
  const columns = await getDriverStatusColumns(executor);

  if (!columns.hasDriverStatus) {
    await executor.query(
      `
        ALTER TABLE users
        ADD COLUMN driver_status VARCHAR(20) NULL DEFAULT 'ACTIVE'
      `,
    );
  }

  if (!columns.hasDriverStatusReason) {
    await executor.query(
      `
        ALTER TABLE users
        ADD COLUMN driver_status_reason TEXT NULL
      `,
    );
  }

  return {
    hasDriverStatus: true,
    hasDriverStatusReason: true,
  };
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
