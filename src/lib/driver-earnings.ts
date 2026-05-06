import type { Pool, PoolConnection, RowDataPacket } from "mysql2/promise";

import pool from "@/lib/db";

type Queryable = Pool | PoolConnection;

type ColumnRow = RowDataPacket & {
  Field: string;
};

export async function ensureDriverEarningsTable(executor: Queryable = pool) {
  await executor.query(
    `
      CREATE TABLE IF NOT EXISTS driver_earnings (
        id INT AUTO_INCREMENT PRIMARY KEY,
        delivery_id INT NOT NULL,
        order_id INT NOT NULL,
        driver_user_id INT NOT NULL,
        delivery_fee DECIMAL(10,2) NOT NULL DEFAULT 0.00,
        driver_fee DECIMAL(10,2) NOT NULL DEFAULT 0.00,
        platform_fee DECIMAL(10,2) NOT NULL DEFAULT 0.00,
        currency VARCHAR(10) NOT NULL DEFAULT 'MXN',
        earning_status VARCHAR(30) NOT NULL DEFAULT 'pending',
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uk_driver_earnings_delivery_id (delivery_id),
        KEY idx_driver_earnings_order_id (order_id),
        KEY idx_driver_earnings_driver_user_id (driver_user_id)
      )
    `,
  );

  const [columns] = await executor.query<ColumnRow[]>(
    "SHOW COLUMNS FROM driver_earnings",
  );
  const columnNames = new Set(columns.map((column) => String(column.Field)));

  if (!columnNames.has("platform_fee")) {
    await executor.query(
      `
        ALTER TABLE driver_earnings
        ADD COLUMN platform_fee DECIMAL(10,2) NOT NULL DEFAULT 0.00
        AFTER driver_fee
      `,
    );
  }

  if (!columnNames.has("currency")) {
    await executor.query(
      `
        ALTER TABLE driver_earnings
        ADD COLUMN currency VARCHAR(10) NOT NULL DEFAULT 'MXN'
        AFTER platform_fee
      `,
    );
  }

  if (!columnNames.has("earning_status")) {
    await executor.query(
      `
        ALTER TABLE driver_earnings
        ADD COLUMN earning_status VARCHAR(30) NOT NULL DEFAULT 'pending'
        AFTER currency
      `,
    );
  }
}

export async function saveDriverEarning(
  params: {
    deliveryId: number;
    orderId: number;
    driverUserId: number;
    deliveryFee: number;
    driverFee: number;
    platformFee: number;
    currency?: string;
    earningStatus?: string;
  },
  executor: Queryable = pool,
) {
  await ensureDriverEarningsTable(executor);

  await executor.query(
    `
      INSERT INTO driver_earnings (
        delivery_id,
        order_id,
        driver_user_id,
        delivery_fee,
        driver_fee,
        platform_fee,
        currency,
        earning_status,
        created_at,
        updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
      ON DUPLICATE KEY UPDATE
        order_id = VALUES(order_id),
        driver_user_id = VALUES(driver_user_id),
        delivery_fee = VALUES(delivery_fee),
        driver_fee = VALUES(driver_fee),
        platform_fee = VALUES(platform_fee),
        currency = VALUES(currency),
        earning_status = VALUES(earning_status),
        updated_at = NOW()
    `,
    [
      params.deliveryId,
      params.orderId,
      params.driverUserId,
      Number(params.deliveryFee.toFixed(2)),
      Number(params.driverFee.toFixed(2)),
      Number(params.platformFee.toFixed(2)),
      params.currency ?? "MXN",
      params.earningStatus ?? "pending",
    ],
  );
}
