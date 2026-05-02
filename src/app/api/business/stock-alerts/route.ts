import type { RowDataPacket } from "mysql2/promise";
import { type NextRequest, NextResponse } from "next/server";

import { getAuthUser } from "@/lib/admin-security";
import pool from "@/lib/db";

type OwnedBusinessRow = RowDataPacket & {
  id: number;
};

type AlertRow = RowDataPacket & {
  id: number;
  name: string;
  category: string | null;
  stock: number | null;
  stock_minimo: number | null;
  is_stock_available: number | boolean | null;
};

function toPositiveNumber(value: string | null) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

export async function GET(req: NextRequest) {
  try {
    const authUser = getAuthUser(req);

    if (!authUser?.user) {
      return NextResponse.json(
        { success: false, error: "Token inválido o faltante" },
        { status: 401 },
      );
    }

    const requestedBusinessId = toPositiveNumber(
      req.nextUrl.searchParams.get("business_id"),
    );

    const [ownedBusinesses] = await pool.query<OwnedBusinessRow[]>(
      `
        SELECT b.id
        FROM business_owners bo
        INNER JOIN business b ON b.id = bo.business_id
        WHERE bo.user_id = ?
        ORDER BY b.id ASC
      `,
      [authUser.user.id],
    );

    if (!ownedBusinesses.length) {
      return NextResponse.json({
        success: true,
        alerts: [],
      });
    }

    const ownedBusinessIds = new Set(
      ownedBusinesses.map((business) => business.id),
    );
    const businessId =
      requestedBusinessId && ownedBusinessIds.has(requestedBusinessId)
        ? requestedBusinessId
        : ownedBusinesses[0].id;

    const [rows] = await pool.query<AlertRow[]>(
      `
        SELECT
          p.id,
          p.name,
          COALESCE(MAX(pc.name), 'Sin categoría') AS category,
          COALESCE(p.stock_average, 0) AS stock,
          COALESCE(NULLIF(p.stock_danger, 0), 0) AS stock_minimo,
          p.is_stock_available
        FROM products p
        LEFT JOIN product_category_map pcm ON pcm.product_id = p.id
        LEFT JOIN product_categories pc ON pc.id = pcm.category_id
        WHERE p.business_id = ?
          AND (
            COALESCE(p.stock_average, 0) <= COALESCE(NULLIF(p.stock_danger, 0), 0)
            OR COALESCE(p.stock_average, 0) <= COALESCE(p.stock_danger, 0)
            OR COALESCE(p.is_stock_available, 1) = 0
          )
        GROUP BY p.id, p.name, p.stock_average, p.stock_danger, p.is_stock_available
        ORDER BY COALESCE(p.stock_average, 0) ASC, p.name ASC
      `,
      [businessId],
    );

    return NextResponse.json({
      success: true,
      alerts: rows.map((row) => ({
        id: row.id,
        name: row.name,
        category: row.category ?? "Sin categoría",
        stock: Number(row.stock ?? 0),
        stock_minimo: Number(row.stock_minimo ?? 0),
        is_stock_available: Boolean(row.is_stock_available),
      })),
    });
  } catch (error) {
    console.error("Error GET /api/business/stock-alerts:", error);
    return NextResponse.json(
      {
        success: false,
        error: "No se pudieron cargar las alertas de stock.",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}
