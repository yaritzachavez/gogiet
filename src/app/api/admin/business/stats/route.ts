import type { RowDataPacket } from "mysql2/promise";
import { type NextRequest, NextResponse } from "next/server";

import { getAuthUser, isAdminGeneral } from "@/lib/admin-security";
import pool from "@/lib/db";

type BusinessStatsRow = RowDataPacket & {
  business_id: number;
  today_orders: number;
  total_sales: number | string | null;
};

export async function GET(req: NextRequest) {
  try {
    const { user: authUser } = getAuthUser(req);

    if (!authUser) {
      return NextResponse.json(
        { success: false, error: "Token inválido o faltante" },
        { status: 401 },
      );
    }

    if (!(await isAdminGeneral(authUser.id))) {
      return NextResponse.json(
        { success: false, error: "No autorizado" },
        { status: 403 },
      );
    }

    const [rows] = await pool.query<BusinessStatsRow[]>(
      `
        SELECT
          b.id AS business_id,
          COALESCE(SUM(CASE WHEN DATE(o.created_at) = CURDATE() THEN 1 ELSE 0 END), 0) AS today_orders,
          COALESCE(SUM(o.total_amount), 0) AS total_sales
        FROM business b
        LEFT JOIN orders o ON o.business_id = b.id
        GROUP BY b.id
      `,
    );

    return NextResponse.json({
      success: true,
      stats: rows.map((row) => ({
        business_id: row.business_id,
        today_orders: Number(row.today_orders ?? 0),
        total_sales: Number(row.total_sales ?? 0),
      })),
    });
  } catch (error) {
    console.error("Error GET /api/admin/business/stats:", error);
    return NextResponse.json(
      {
        success: false,
        error: "No se pudieron cargar las estadísticas de negocios.",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}
