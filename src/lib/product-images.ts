import type { RowDataPacket } from "mysql2/promise";

import pool from "@/lib/db";

type TableRow = RowDataPacket & {
  table_name: string;
};

type ColumnRow = RowDataPacket & {
  column_name: string;
};

type ProductImageQueryConfig = {
  imageJoinSql: string;
  imageSelectSql: string;
  thumbnailSelectSql: string;
};

let cachedProductImageQueryConfig: ProductImageQueryConfig | null = null;

export async function getProductImageQueryConfig() {
  if (cachedProductImageQueryConfig) {
    return cachedProductImageQueryConfig;
  }

  const [tableRows] = await pool.query<TableRow[]>(
    `
      SELECT TABLE_NAME AS table_name
      FROM INFORMATION_SCHEMA.TABLES
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'product_images'
    `,
  );
  const [productColumnRows] = await pool.query<ColumnRow[]>(
    `
      SELECT COLUMN_NAME AS column_name
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'products'
        AND COLUMN_NAME IN ('thumbnail_url', 'image_url')
    `,
  );

  const hasProductImagesTable = tableRows.length > 0;
  const productColumns = new Set(
    productColumnRows.map((row) => String(row.column_name).toLowerCase()),
  );

  const imageColumns = [
    productColumns.has("thumbnail_url") ? "p.thumbnail_url" : null,
    hasProductImagesTable ? "pi.image_url" : null,
    productColumns.has("image_url") ? "p.image_url" : null,
    "''",
  ].filter(Boolean);

  cachedProductImageQueryConfig = {
    imageJoinSql: hasProductImagesTable
      ? `
        LEFT JOIN (
          SELECT product_id, MAX(image_url) AS image_url
          FROM product_images
          GROUP BY product_id
        ) pi ON pi.product_id = p.id
      `
      : "",
    imageSelectSql: `COALESCE(${imageColumns.join(", ")}) AS image_url`,
    thumbnailSelectSql: productColumns.has("thumbnail_url")
      ? "p.thumbnail_url AS thumbnail_url"
      : "NULL AS thumbnail_url",
  };

  return cachedProductImageQueryConfig;
}
