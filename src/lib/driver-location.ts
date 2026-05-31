import type { Pool, PoolConnection, RowDataPacket } from "mysql2/promise";

import pool from "@/lib/db";
import { assertTablesExist } from "@/lib/runtime-schema";

type Queryable = Pool | PoolConnection;

type ColumnRow = RowDataPacket & {
  column_name: string;
};

export type DriverLocationColumns = {
  hasLatitude: boolean;
  hasLongitude: boolean;
  hasUpdatedAt: boolean;
};

export async function getDriverLocationColumns(
  executor: Queryable = pool,
): Promise<DriverLocationColumns> {
  await assertTablesExist(executor, ["users"]);

  const [rows] = await executor.query<ColumnRow[]>(
    `
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = DATABASE()
        AND table_name = 'users'
        AND column_name IN (
          'last_latitude',
          'last_longitude',
          'last_location_at'
        )
    `,
  );

  const columnNames = new Set(
    rows.map((row) => String(row.column_name).toLowerCase()),
  );

  return {
    hasLatitude: columnNames.has("last_latitude"),
    hasLongitude: columnNames.has("last_longitude"),
    hasUpdatedAt: columnNames.has("last_location_at"),
  };
}

export async function ensureDriverLocationColumns(executor: Queryable = pool) {
  const columns = await getDriverLocationColumns(executor);

  const addColumnIfMissing = async (sql: string) => {
    try {
      await executor.query(sql);
    } catch (error) {
      const errorLike = error as { code?: unknown; errno?: unknown };
      if (
        String(errorLike?.code ?? "").toUpperCase() === "ER_DUP_FIELDNAME" ||
        Number(errorLike?.errno) === 1060
      ) {
        return;
      }

      throw error;
    }
  };

  if (!columns.hasLatitude) {
    await addColumnIfMissing(
      "ALTER TABLE users ADD COLUMN last_latitude DECIMAL(10,7) NULL",
    );
  }

  if (!columns.hasLongitude) {
    await addColumnIfMissing(
      "ALTER TABLE users ADD COLUMN last_longitude DECIMAL(10,7) NULL",
    );
  }

  if (!columns.hasUpdatedAt) {
    await addColumnIfMissing(
      "ALTER TABLE users ADD COLUMN last_location_at DATETIME NULL",
    );
  }

  return {
    hasLatitude: true,
    hasLongitude: true,
    hasUpdatedAt: true,
  };
}
