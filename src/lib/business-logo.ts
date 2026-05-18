import pool from "@/lib/db";
import { assertTablesExist, getExistingColumns } from "@/lib/runtime-schema";

const LEGACY_BUSINESS_IMAGE_COLUMNS = [
  "avatar_url",
  "image_url",
  "photo_url",
  "logo",
] as const;

export async function ensureBusinessLogoColumn() {
  await assertTablesExist(pool, ["business"]);
  const availableColumns = await getExistingColumns(pool, "business", [
    "logo_url",
    "avatar_url",
    "image_url",
    "photo_url",
    "logo",
  ]);

  const normalizedColumns = new Set(
    Array.from(availableColumns).map((column) => column.toLowerCase()),
  );

  const sourceColumns = LEGACY_BUSINESS_IMAGE_COLUMNS.filter((column) =>
    normalizedColumns.has(column),
  );

  if (normalizedColumns.has("logo_url") && sourceColumns.length > 0) {
    await pool.query(`
      UPDATE business
      SET logo_url = COALESCE(
        logo_url,
        ${sourceColumns.map((column) => `NULLIF(${column}, '')`).join(", ")}
      )
      WHERE logo_url IS NULL OR TRIM(logo_url) = ''
    `);
  }

  return normalizedColumns.has("logo_url")
    ? ("logo_url" as const)
    : ("avatar_url" as const);
}

export function getBusinessLogoSelect(alias = "b") {
  return `${alias}.logo_url AS logo_url`;
}
