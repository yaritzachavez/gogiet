import type { Pool, PoolConnection, RowDataPacket } from "mysql2/promise";

type ColumnExistsRow = RowDataPacket & {
  column_name: string;
};

type SqlExecutor = Pool | PoolConnection;

export const SHIPPING_FEE_COLUMN_CANDIDATES = [
  "delivery_fee",
  "shipping_fee",
  "delivery_cost",
  "envio",
  "freight",
] as const;

export const TIP_COLUMN_CANDIDATES = ["tip_amount", "tip", "tips"] as const;
export const DEFAULT_DELIVERY_FEE_RATE = 0.1;
export const COURIER_EARNING_RATE = 0.7;

export async function getExistingColumns(
  executor: SqlExecutor,
  tableName: string,
  columnNames: readonly string[],
) {
  if (!columnNames.length) {
    return new Set<string>();
  }

  const placeholders = columnNames.map(() => "?").join(", ");
  const [rows] = await executor.query<ColumnExistsRow[]>(
    `
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = DATABASE()
        AND table_name = ?
        AND column_name IN (${placeholders})
    `,
    [tableName, ...columnNames],
  );

  return new Set(rows.map((row) => String(row.column_name).toLowerCase()));
}

export function pickFirstExistingColumn(
  availableColumns: Set<string>,
  columnCandidates: readonly string[],
) {
  return (
    columnCandidates.find((column) => availableColumns.has(column)) ?? null
  );
}

export function getShippingFeeSqlExpression(shippingFeeColumn: string | null) {
  if (shippingFeeColumn) {
    return `COALESCE(o.${shippingFeeColumn}, 0)`;
  }

  return `COALESCE(o.total_amount, 0) * ${DEFAULT_DELIVERY_FEE_RATE}`;
}

export function getShippingFeeSourceLabel(shippingFeeColumn: string | null) {
  return shippingFeeColumn
    ? `orders.${shippingFeeColumn}`
    : `fallback: orders.total_amount * ${DEFAULT_DELIVERY_FEE_RATE}`;
}
