import type { RowDataPacket } from "mysql2/promise";
import { type NextRequest, NextResponse } from "next/server";

import { getAuthUser } from "@/lib/admin-security";
import pool from "@/lib/db";

type OwnedBusinessRow = RowDataPacket & {
  id: number;
};

type DailyRow = RowDataPacket & {
  day_key: string;
  sales_total: number | string | null;
  orders_count: number | null;
};

function toPositiveNumber(value: string | null) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function startOfDay(date: Date) {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
}

function formatDayKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

function formatDayLabel(date: Date) {
  return new Intl.DateTimeFormat("es-MX", {
    weekday: "short",
  })
    .format(date)
    .replace(".", "")
    .slice(0, 3);
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
        business_id: null,
        days: [],
        current_period_sales_total: 0,
        previous_period_sales_total: 0,
        week_over_week_change: 0,
      });
    }

    const ownedBusinessIds = new Set(
      ownedBusinesses.map((business) => business.id),
    );
    const businessId =
      requestedBusinessId && ownedBusinessIds.has(requestedBusinessId)
        ? requestedBusinessId
        : ownedBusinesses[0].id;

    const today = startOfDay(new Date());
    const currentStart = startOfDay(new Date(today));
    currentStart.setDate(currentStart.getDate() - 6);
    const previousStart = startOfDay(new Date(currentStart));
    previousStart.setDate(previousStart.getDate() - 7);

    const [rows] = await pool.query<DailyRow[]>(
      `
        SELECT
          DATE(o.created_at) AS day_key,
          COALESCE(SUM(o.total_amount), 0) AS sales_total,
          COUNT(*) AS orders_count
        FROM orders o
        LEFT JOIN order_status_catalog osc ON osc.id = o.order_status_id
        WHERE o.business_id = ?
          AND o.created_at >= ?
          AND LOWER(TRIM(COALESCE(osc.name, ''))) NOT IN ('cancelado', 'pago_rechazado')
        GROUP BY DATE(o.created_at)
        ORDER BY DATE(o.created_at) ASC
      `,
      [businessId, previousStart],
    );

    const totalsByDay = new Map(
      rows.map((row) => [
        String(row.day_key).slice(0, 10),
        {
          sales_total: Number(row.sales_total ?? 0),
          orders_count: Number(row.orders_count ?? 0),
        },
      ]),
    );

    const currentDays = Array.from({ length: 7 }, (_, index) => {
      const date = startOfDay(new Date(currentStart));
      date.setDate(currentStart.getDate() + index);
      const dayKey = formatDayKey(date);
      const values = totalsByDay.get(dayKey) ?? {
        sales_total: 0,
        orders_count: 0,
      };

      return {
        day: formatDayLabel(date),
        sales_total: values.sales_total,
        orders_count: values.orders_count,
      };
    });

    const previousPeriodSalesTotal = Array.from({ length: 7 }, (_, index) => {
      const date = startOfDay(new Date(previousStart));
      date.setDate(previousStart.getDate() + index);
      const values = totalsByDay.get(formatDayKey(date));
      return Number(values?.sales_total ?? 0);
    }).reduce((sum, value) => sum + value, 0);

    const currentPeriodSalesTotal = currentDays.reduce(
      (sum, day) => sum + day.sales_total,
      0,
    );

    const weekOverWeekChange =
      previousPeriodSalesTotal <= 0
        ? currentPeriodSalesTotal > 0
          ? 100
          : 0
        : Number(
            (
              ((currentPeriodSalesTotal - previousPeriodSalesTotal) /
                previousPeriodSalesTotal) *
              100
            ).toFixed(1),
          );

    return NextResponse.json({
      success: true,
      business_id: businessId,
      days: currentDays,
      current_period_sales_total: currentPeriodSalesTotal,
      previous_period_sales_total: previousPeriodSalesTotal,
      week_over_week_change: weekOverWeekChange,
    });
  } catch (error) {
    console.error("Error GET /api/business/reports/weekly:", error);
    return NextResponse.json(
      {
        success: false,
        error: "No se pudo cargar el reporte semanal.",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}
