import type { RowDataPacket } from "mysql2/promise";
import { NextResponse } from "next/server";

import pool from "@/lib/db";

export const runtime = "nodejs";

type TableRow = RowDataPacket & {
  tableName: string;
};

type ColumnRow = RowDataPacket & {
  tableName: string;
  columnName: string;
};

type DatabaseRow = RowDataPacket & {
  databaseName: string | null;
};

export async function GET() {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json(
      {
        success: false,
        error: "Ruta no disponible en producción.",
      },
      { status: 403 },
    );
  }

  try {
    const [databaseRows] = await pool.query<DatabaseRow[]>(
      "SELECT DATABASE() AS databaseName",
    );
    const database = String(databaseRows[0]?.databaseName ?? "").trim();

    const [tableRows] = await pool.query<TableRow[]>(
      `
        SELECT table_name AS tableName
        FROM information_schema.tables
        WHERE table_schema = DATABASE()
        ORDER BY table_name ASC
      `,
    );

    const [columnRows] = await pool.query<ColumnRow[]>(
      `
        SELECT
          table_name AS tableName,
          column_name AS columnName
        FROM information_schema.columns
        WHERE table_schema = DATABASE()
        ORDER BY table_name ASC, ordinal_position ASC
      `,
    );

    console.log("DEV DB INSPECT SAMPLE:", {
      databaseRow: databaseRows[0] ?? null,
      tableRow: tableRows[0] ?? null,
      columnRow: columnRows[0] ?? null,
    });

    const columnsByTable = new Map<string, string[]>();

    for (const row of columnRows) {
      const tableName = String(row.tableName ?? "").trim();
      const columnName = String(row.columnName ?? "").trim();

      if (!tableName || !columnName) {
        continue;
      }

      const existing = columnsByTable.get(tableName) ?? [];
      existing.push(columnName);
      columnsByTable.set(tableName, existing);
    }

    const tables = tableRows.map((row) => {
      const tableName = String(row.tableName ?? "").trim();
      return {
        tableName,
        columns: columnsByTable.get(tableName) ?? [],
      };
    }).filter((table) => Boolean(table.tableName));

    return NextResponse.json({
      success: true,
      database,
      tables,
    });
  } catch (error) {
    console.error("DEV DB INSPECT ERROR:", {
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });

    return NextResponse.json(
      {
        success: false,
        error: "No se pudo inspeccionar la base de datos.",
      },
      { status: 500 },
    );
  }
}
