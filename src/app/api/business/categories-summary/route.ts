import type { RowDataPacket } from "mysql2/promise";
import { type NextRequest, NextResponse } from "next/server";

import { getAuthUser } from "@/lib/admin-security";
import pool from "@/lib/db";

type OwnedBusinessRow = RowDataPacket & {
  id: number;
};

type SummaryRow = RowDataPacket & {
  category: string | null;
  total_products: number | null;
  out_of_stock: number | null;
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
        summary: [],
      });
    }

    const ownedBusinessIds = new Set(
      ownedBusinesses.map((business) => business.id),
    );
    const businessId =
      requestedBusinessId && ownedBusinessIds.has(requestedBusinessId)
        ? requestedBusinessId
        : ownedBusinesses[0].id;

    const [rows] = await pool.query<SummaryRow[]>(
      `
        SELECT
          COALESCE(MAX(pc.name), 'Sin categoría') AS category,
          COUNT(DISTINCT p.id) AS total_products,
          COUNT(
            DISTINCT CASE
              WHEN COALESCE(p.stock_average, 0) <= COALESCE(p.stock_danger, 0)
                OR COALESCE(p.is_stock_available, 1) = 0
              THEN p.id
              ELSE NULL
            END
          ) AS out_of_stock
        FROM products p
        LEFT JOIN product_category_map pcm ON pcm.product_id = p.id
        LEFT JOIN product_categories pc ON pc.id = pcm.category_id
        WHERE p.business_id = ?
        GROUP BY COALESCE(pc.id, 0), COALESCE(pc.name, 'Sin categoría')
        ORDER BY category ASC
      `,
      [businessId],
    );

    return NextResponse.json({
      success: true,
      summary: rows.map((row) => {
        const totalProducts = Number(row.total_products ?? 0);
        const outOfStock = Number(row.out_of_stock ?? 0);

        return {
          category: row.category ?? "Sin categoría",
          total_products: totalProducts,
          out_of_stock: outOfStock,
          out_of_stock_percentage:
            totalProducts === 0
              ? 0
              : Math.round((outOfStock / totalProducts) * 100),
        };
      }),
    });
  } catch (error) {
    console.error("Error GET /api/business/categories-summary:", error);
    return NextResponse.json(
      {
        success: false,
        error: "No se pudo cargar el resumen por categoría.",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}
