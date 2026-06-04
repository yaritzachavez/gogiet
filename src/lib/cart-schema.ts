import type { RowDataPacket } from "mysql2/promise";

import pool from "@/lib/db";

type ColumnRow = RowDataPacket & {
  column_name: string;
};

export type CartRuntimeSchema = {
  cartHasTotal: boolean;
  cartHasUpdatedAt: boolean;
  productsCartHasUnitPrice: boolean;
  productsCartHasSubtotal: boolean;
  productsCartHasTotal: boolean;
  productsCartHasDiscount: boolean;
  productsCartHasAddedAt: boolean;
  productsCartHasUpdatedAt: boolean;
};

let cachedCartRuntimeSchema: CartRuntimeSchema | null = null;

async function getTableColumns(tableName: string) {
  const [rows] = await pool.query<ColumnRow[]>(
    `
      SELECT COLUMN_NAME AS column_name
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = ?
    `,
    [tableName],
  );

  return new Set(
    rows.map((row) =>
      String(row.column_name ?? "")
        .trim()
        .toLowerCase(),
    ),
  );
}

export async function getCartRuntimeSchema() {
  if (cachedCartRuntimeSchema) {
    return cachedCartRuntimeSchema;
  }

  const [cartColumns, productsCartColumns] = await Promise.all([
    getTableColumns("cart"),
    getTableColumns("products_cart"),
  ]);

  cachedCartRuntimeSchema = {
    cartHasTotal: cartColumns.has("total"),
    cartHasUpdatedAt: cartColumns.has("updated_at"),
    productsCartHasUnitPrice: productsCartColumns.has("unit_price"),
    productsCartHasSubtotal: productsCartColumns.has("subtotal"),
    productsCartHasTotal: productsCartColumns.has("total"),
    productsCartHasDiscount: productsCartColumns.has("discount"),
    productsCartHasAddedAt: productsCartColumns.has("added_at"),
    productsCartHasUpdatedAt: productsCartColumns.has("updated_at"),
  };

  return cachedCartRuntimeSchema;
}

export function getProductsCartLineTotalSql(
  schema: CartRuntimeSchema,
  alias = "pc",
) {
  const candidates = [
    schema.productsCartHasSubtotal ? `${alias}.subtotal` : null,
    schema.productsCartHasTotal ? `${alias}.total` : null,
    schema.productsCartHasUnitPrice
      ? `${alias}.unit_price * ${alias}.quantity`
      : null,
    "0",
  ].filter(Boolean);

  return `COALESCE(${candidates.join(", ")})`;
}

export function getProductsCartUnitPriceSql(
  schema: CartRuntimeSchema,
  alias = "pc",
  fallbackSql = "0",
) {
  const candidates = [
    schema.productsCartHasUnitPrice ? `${alias}.unit_price` : null,
    fallbackSql,
  ].filter(Boolean);

  return `COALESCE(${candidates.join(", ")})`;
}

export function getCartProductsOrderBySql(
  schema: CartRuntimeSchema,
  alias = "pc",
) {
  if (schema.productsCartHasAddedAt) {
    return `ORDER BY ${alias}.added_at DESC, ${alias}.product_id DESC`;
  }

  return `ORDER BY ${alias}.product_id DESC`;
}

export function getCartTouchQuery(schema: CartRuntimeSchema) {
  const assignments = [
    schema.cartHasUpdatedAt ? "updated_at = NOW()" : null,
  ].filter(Boolean);

  if (assignments.length === 0) {
    return null;
  }

  return `UPDATE cart SET ${assignments.join(", ")} WHERE id = ?`;
}

export function getCartRecalculateTotalQuery(schema: CartRuntimeSchema) {
  if (!schema.cartHasTotal) {
    return getCartTouchQuery(schema);
  }

  const assignments = [
    `total = (SELECT COALESCE(SUM(${getProductsCartLineTotalSql(schema)}), 0) FROM products_cart pc WHERE pc.cart_id = ?)`,
    schema.cartHasUpdatedAt ? "updated_at = NOW()" : null,
  ].filter(Boolean);

  return `UPDATE cart SET ${assignments.join(", ")} WHERE id = ?`;
}
