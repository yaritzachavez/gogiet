import type { RowDataPacket } from "mysql2/promise";

import pool from "@/lib/db";

type BusinessImageColumnRow = RowDataPacket & {
  column_name: string;
};

const LEGACY_BUSINESS_IMAGE_COLUMNS = [
  "avatar_url",
  "image_url",
  "photo_url",
  "logo",
] as const;

export async function ensureBusinessLogoColumn() {
  const [rows] = await pool.query<BusinessImageColumnRow[]>(
    `
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = DATABASE()
        AND table_name = 'business'
        AND column_name IN ('logo_url', 'avatar_url', 'image_url', 'photo_url', 'logo')
    `,
  );

  const availableColumns = new Set(
    rows.map((row) => String(row.column_name).toLowerCase()),
  );

  if (!availableColumns.has("logo_url")) {
    try {
      await pool.query(`
        ALTER TABLE business
        ADD COLUMN logo_url VARCHAR(255) NULL
      `);

      availableColumns.add("logo_url");
    } catch (error) {
      if (availableColumns.has("avatar_url")) {
        console.error("[business-logo] No se pudo crear logo_url; usando avatar_url como respaldo", {
          error: error instanceof Error ? error.message : String(error),
        });
        return "avatar_url" as const;
      }

      throw error;
    }
  }

  const sourceColumns = LEGACY_BUSINESS_IMAGE_COLUMNS.filter((column) =>
    availableColumns.has(column),
  );

  if (sourceColumns.length > 0) {
    await pool.query(`
      UPDATE business
      SET logo_url = COALESCE(
        logo_url,
        ${sourceColumns.map((column) => `NULLIF(${column}, '')`).join(", ")}
      )
      WHERE logo_url IS NULL OR TRIM(logo_url) = ''
    `);
  }

  return availableColumns.has("logo_url") ? ("logo_url" as const) : ("avatar_url" as const);
}

export function getBusinessLogoSelect(alias = "b") {
  return `${alias}.logo_url AS logo_url`;
}
