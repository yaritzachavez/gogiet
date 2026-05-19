import type { Pool, PoolConnection } from "mysql2/promise";

import pool from "@/lib/db";
import { assertColumnsExist, assertTablesExist } from "@/lib/runtime-schema";

type Queryable = Pool | PoolConnection;

export async function ensureDriverEarningsTable(executor: Queryable = pool) {
  await assertTablesExist(executor, ["driver_earnings"]);
  await assertColumnsExist(executor, "driver_earnings", [
    "id",
    "delivery_id",
    "order_id",
    "driver_user_id",
    "delivery_fee",
    "driver_fee",
    "platform_fee",
    "currency",
    "earning_status",
    "created_at",
    "updated_at",
  ]);
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
