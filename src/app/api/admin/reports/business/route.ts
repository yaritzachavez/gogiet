import jwt from "jsonwebtoken";
import type { RowDataPacket } from "mysql2/promise";
import { type NextRequest, NextResponse } from "next/server";

import pool from "@/lib/db";

type JwtPayload = {
  id: number;
  roles?: string[];
};

type SummaryRow = RowDataPacket & {
  total_orders: number;
  completed_orders: number;
  pending_orders: number;
  gross_sales: string | number | null;
  service_fees: string | number | null;
  shipping_total: string | number | null;
  business_earnings: string | number | null;
};

type PaymentMethodRow = RowDataPacket & {
  payment_method: string | null;
  total_orders: number;
};

type OrderRow = RowDataPacket & {
  id: number;
  business_name: string;
  customer_name: string;
  status_name: string;
  payment_method: string | null;
  subtotal: string | number | null;
  service_fee: string | number | null;
  shipping_total: string | number | null;
  total_amount: string | number | null;
  created_at: string;
};

type BusinessRow = RowDataPacket & {
  id: number;
  name: string;
};

const COMPLETED_STATUSES = ["entregado", "completado", "completed"];
const CANCELLED_STATUSES = ["cancelado", "cancelled"];

function getAuthUser(req: NextRequest) {
  const auth = req.headers.get("authorization");
  const token = auth?.startsWith("Bearer ")
    ? auth.split(" ")[1]
    : req.cookies.get("authToken")?.value;
  const secret = process.env.JWT_SECRET || "gogi-dev-secret";

  if (!token) return null;

  try {
    return jwt.verify(token, secret) as JwtPayload;
  } catch {
    return null;
  }
}

async function isAdminGeneral(userId: number) {
  const [rows] = await pool.query<RowDataPacket[]>(
    `
      SELECT 1
      FROM user_roles ur
      INNER JOIN roles r ON r.id = ur.role_id
      WHERE ur.user_id = ? AND r.name = 'admin_general'
      LIMIT 1
    `,
    [userId],
  );

  return rows.length > 0;
}

function toDateString(value: Date) {
  return value.toISOString().slice(0, 10);
}

function getDateRange(
  period: string,
  startDate?: string | null,
  endDate?: string | null,
) {
  const today = new Date();
  const now = new Date(
    today.getFullYear(),
    today.getMonth(),
    today.getDate(),
    23,
    59,
    59,
  );

  if (period === "custom" && startDate && endDate) {
    return {
      start: `${startDate} 00:00:00`,
      end: `${endDate} 23:59:59`,
    };
  }

  if (period === "week") {
    const start = new Date(today);
    const day = start.getDay();
    const diff = day === 0 ? -6 : 1 - day;
    start.setDate(start.getDate() + diff);

    return {
      start: `${toDateString(start)} 00:00:00`,
      end: `${toDateString(now)} 23:59:59`,
    };
  }

  if (period === "month") {
    const start = new Date(today.getFullYear(), today.getMonth(), 1);

    return {
      start: `${toDateString(start)} 00:00:00`,
      end: `${toDateString(now)} 23:59:59`,
    };
  }

  return {
    start: `${toDateString(today)} 00:00:00`,
    end: `${toDateString(now)} 23:59:59`,
  };
}

function toNumber(value: string | number | null | undefined) {
  return Number(value ?? 0);
}

export async function GET(req: NextRequest) {
  try {
    const authUser = getAuthUser(req);

    if (!authUser) {
      return NextResponse.json(
        { error: "Token inválido o faltante" },
        { status: 401 },
      );
    }

    if (!(await isAdminGeneral(authUser.id))) {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const businessIdParam = searchParams.get("business_id");
    const period = searchParams.get("period") ?? "day";
    const startDate = searchParams.get("start_date");
    const endDate = searchParams.get("end_date");

    const businessId =
      businessIdParam && Number.isFinite(Number(businessIdParam))
        ? Number(businessIdParam)
        : null;

    const { start, end } = getDateRange(period, startDate, endDate);
    const filters = ["o.created_at BETWEEN ? AND ?"];
    const values: Array<string | number> = [start, end];

    if (businessId) {
      filters.push("o.business_id = ?");
      values.push(businessId);
    }

    const whereClause = `WHERE ${filters.join(" AND ")}`;

    const [businesses] = await pool.query<BusinessRow[]>(
      `
        SELECT id, name
        FROM business
        ORDER BY name ASC
      `,
    );

    const [summaryRows] = await pool.query<SummaryRow[]>(
      `
        SELECT
          COUNT(o.id) AS total_orders,
          SUM(
            CASE
              WHEN LOWER(osc.name) IN (${COMPLETED_STATUSES.map(() => "?").join(",")})
                THEN 1
              ELSE 0
            END
          ) AS completed_orders,
          SUM(
            CASE
              WHEN LOWER(osc.name) NOT IN (${[...COMPLETED_STATUSES, ...CANCELLED_STATUSES].map(() => "?").join(",")})
                THEN 1
              ELSE 0
            END
          ) AS pending_orders,
          COALESCE(SUM(o.total_amount), 0) AS gross_sales,
          COALESCE(SUM(o.service_fee), 0) AS service_fees,
          COALESCE(SUM(o.delivery_fee), 0) AS shipping_total,
          COALESCE(SUM(o.total_amount - o.service_fee - o.delivery_fee), 0) AS business_earnings
        FROM orders o
        LEFT JOIN order_status_catalog osc ON osc.id = o.order_status_id
        ${whereClause}
      `,
      [
        ...COMPLETED_STATUSES,
        ...COMPLETED_STATUSES,
        ...CANCELLED_STATUSES,
        ...values,
      ],
    );

    const [paymentMethods] = await pool.query<PaymentMethodRow[]>(
      `
        SELECT
          COALESCE(o.payment_method, pm.name, 'sin_definir') AS payment_method,
          COUNT(o.id) AS total_orders
        FROM orders o
        LEFT JOIN payment_methods pm ON pm.id = o.payment_method_id
        ${whereClause}
        GROUP BY COALESCE(o.payment_method, pm.name, 'sin_definir')
        ORDER BY total_orders DESC
      `,
      values,
    );

    const [orders] = await pool.query<OrderRow[]>(
      `
        SELECT
          o.id,
          b.name AS business_name,
          CONCAT(u.first_name, ' ', COALESCE(u.last_name, '')) AS customer_name,
          osc.name AS status_name,
          COALESCE(o.payment_method, pm.name) AS payment_method,
          o.subtotal,
          o.service_fee,
          o.delivery_fee AS shipping_total,
          o.total_amount,
          o.created_at
        FROM orders o
        LEFT JOIN business b ON b.id = o.business_id
        LEFT JOIN users u ON u.id = o.user_id
        LEFT JOIN order_status_catalog osc ON osc.id = o.order_status_id
        LEFT JOIN payment_methods pm ON pm.id = o.payment_method_id
        ${whereClause}
        ORDER BY o.created_at DESC
        LIMIT 100
      `,
      values,
    );

    const summary = summaryRows[0] ?? {
      total_orders: 0,
      completed_orders: 0,
      pending_orders: 0,
      gross_sales: 0,
      service_fees: 0,
      shipping_total: 0,
      business_earnings: 0,
    };

    return NextResponse.json({
      success: true,
      filters: {
        business_id: businessId,
        period,
        start_date: start.slice(0, 10),
        end_date: end.slice(0, 10),
      },
      businesses: businesses.map((business) => ({
        id: Number(business.id),
        name: String(business.name),
      })),
      summary: {
        total_orders: Number(summary.total_orders ?? 0),
        completed_orders: Number(summary.completed_orders ?? 0),
        pending_orders: Number(summary.pending_orders ?? 0),
        gross_sales: toNumber(summary.gross_sales),
        service_fees: toNumber(summary.service_fees),
        shipping_total: toNumber(summary.shipping_total),
        business_earnings: toNumber(summary.business_earnings),
      },
      payment_methods: paymentMethods.map((item) => ({
        name: String(item.payment_method ?? "sin_definir"),
        total_orders: Number(item.total_orders ?? 0),
      })),
      orders: orders.map((order) => ({
        id: Number(order.id),
        business_name: String(order.business_name ?? ""),
        customer_name: String(order.customer_name ?? ""),
        status_name: String(order.status_name ?? ""),
        payment_method: String(order.payment_method ?? ""),
        subtotal: toNumber(order.subtotal),
        service_fee: toNumber(order.service_fee),
        shipping_total: toNumber(order.shipping_total),
        total_amount: toNumber(order.total_amount),
        created_at: order.created_at,
      })),
    });
  } catch (error) {
    console.error("Error GET /api/admin/reports/business:", error);
    return NextResponse.json(
      {
        error: "No se pudieron cargar los reportes del negocio",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}
