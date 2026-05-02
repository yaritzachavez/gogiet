import type { RowDataPacket } from "mysql2/promise";
import { NextResponse } from "next/server";

import pool from "@/lib/db";

type CategoryRow = RowDataPacket & {
  id: number;
  name: string;
};

type ColumnRow = RowDataPacket & {
  COLUMN_NAME: string;
};

export async function GET() {
  try {
    const [columnRows] = await pool.query<ColumnRow[]>(
      `
        SELECT COLUMN_NAME
        FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = 'product_categories'
      `,
    );

    const columnNames = new Set(
      columnRows.map((row) => String(row.COLUMN_NAME).toLowerCase()),
    );

    const activeCondition = columnNames.has("is_active")
      ? "WHERE COALESCE(pc.is_active, 1) = 1"
      : columnNames.has("status_id")
        ? "WHERE COALESCE(pc.status_id, 1) = 1"
        : "";

    const [rows] = await pool.query<CategoryRow[]>(
      `
        SELECT pc.id, pc.name
        FROM product_categories pc
        ${activeCondition}
        ORDER BY pc.name ASC
      `,
    );

    return NextResponse.json(
      {
        success: true,
        categories: rows.map((row) => ({
          id: Number(row.id),
          name: String(row.name ?? ""),
        })),
      },
      { status: 200 },
    );
  } catch (error) {
    console.error("Error GET /api/product-categories:", error);
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "No se pudieron cargar las categorías de producto.",
        categories: [],
      },
      { status: 500 },
    );
  }
}
