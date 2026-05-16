import jwt from "jsonwebtoken";
import type { RowDataPacket } from "mysql2/promise";
import { type NextRequest, NextResponse } from "next/server";

import pool from "@/lib/db";

type JwtPayload = {
  id: number;
};

type BusinessRow = RowDataPacket & {
  id: number;
  name: string;
};

type OrderRow = RowDataPacket & {
  id: number;
  business_id: number | null;
  business_name: string | null;
  customer_name: string | null;
  customer_email: string | null;
  delivery_id: number | null;
  driver_user_id: number | null;
  driver_name: string | null;
  status_name: string | null;
  payment_method: string | null;
  total_amount: string | number | null;
  created_at: string;
  delivery_address: string | null;
};

type ItemRow = RowDataPacket & {
  id: number;
  order_id: number;
  product_id: number | null;
  product_name: string | null;
  quantity: number;
};

type FilterOptionRow = RowDataPacket & {
  name: string | null;
};

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
  const end = new Date(
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
      end: `${toDateString(end)} 23:59:59`,
    };
  }

  if (period === "month") {
    const start = new Date(today.getFullYear(), today.getMonth(), 1);

    return {
      start: `${toDateString(start)} 00:00:00`,
      end: `${toDateString(end)} 23:59:59`,
    };
  }

  return {
    start: `${toDateString(today)} 00:00:00`,
    end: `${toDateString(end)} 23:59:59`,
  };
}

function toNumber(value: string | number | null | undefined) {
  return Number(value ?? 0);
}

function buildInClause(values: number[]) {
  return values.map(() => "?").join(",");
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
    const statusParam = searchParams.get("status");
    const paymentMethodParam = searchParams.get("payment_method");
    const period = searchParams.get("period") ?? "day";
    const startDate = searchParams.get("start_date");
    const endDate = searchParams.get("end_date");

    const businessId =
      businessIdParam && Number.isFinite(Number(businessIdParam))
        ? Number(businessIdParam)
        : null;
    const status = String(statusParam ?? "")
      .trim()
      .toLowerCase();
    const paymentMethod = String(paymentMethodParam ?? "")
      .trim()
      .toLowerCase();
    const { start, end } = getDateRange(period, startDate, endDate);

    const filters = ["o.created_at BETWEEN ? AND ?"];
    const values: Array<string | number> = [start, end];

    if (businessId) {
      filters.push("o.business_id = ?");
      values.push(businessId);
    }

    if (status) {
      filters.push("LOWER(COALESCE(osc.name, 'pendiente')) = ?");
      values.push(status);
    }

    if (paymentMethod) {
      filters.push(
        "LOWER(COALESCE(o.payment_method, pm.name, 'sin_definir')) = ?",
      );
      values.push(paymentMethod);
    }

    const whereClause = `WHERE ${filters.join(" AND ")}`;

    const [businesses] = await pool.query<BusinessRow[]>(
      `
        SELECT id, name
        FROM business
        ORDER BY name ASC
      `,
    );

    const [statusRows] = await pool.query<FilterOptionRow[]>(
      `
        SELECT DISTINCT osc.name
        FROM orders o
        LEFT JOIN order_status_catalog osc ON osc.id = o.order_status_id
        WHERE osc.name IS NOT NULL AND osc.name <> ''
        ORDER BY osc.name ASC
      `,
    );

    const [paymentMethodRows] = await pool.query<FilterOptionRow[]>(
      `
        SELECT DISTINCT COALESCE(o.payment_method, pm.name) AS name
        FROM orders o
        LEFT JOIN payment_methods pm ON pm.id = o.payment_method_id
        WHERE COALESCE(o.payment_method, pm.name) IS NOT NULL
          AND COALESCE(o.payment_method, pm.name) <> ''
        ORDER BY name ASC
      `,
    );

    const [orders] = await pool.query<OrderRow[]>(
      `
        SELECT
          o.id,
          o.business_id,
          b.name AS business_name,
          TRIM(CONCAT_WS(' ', u.first_name, u.last_name)) AS customer_name,
          u.email AS customer_email,
          d.id AS delivery_id,
          d.driver_user_id,
          TRIM(CONCAT_WS(' ', du.first_name, du.last_name)) AS driver_name,
          COALESCE(osc.name, 'pendiente') AS status_name,
          COALESCE(o.payment_method, pm.name, 'sin_definir') AS payment_method,
          o.total_amount,
          o.created_at,
          TRIM(
            CONCAT_WS(
              ', ',
              NULLIF(TRIM(CONCAT_WS(' ', a.street, a.external_number)), ''),
              NULLIF(a.neighborhood, ''),
              NULLIF(a.city, '')
            )
          ) AS delivery_address
        FROM orders o
        LEFT JOIN users u ON u.id = o.user_id
        LEFT JOIN business b ON b.id = o.business_id
        LEFT JOIN addresses a ON a.id = o.address_id
        LEFT JOIN delivery d ON d.order_id = o.id
        LEFT JOIN users du ON du.id = d.driver_user_id
        LEFT JOIN payment_methods pm ON pm.id = o.payment_method_id
        LEFT JOIN order_status_catalog osc ON osc.id = o.order_status_id
        ${whereClause}
        ORDER BY o.created_at DESC
        LIMIT 250
      `,
      values,
    );

    const orderIds = orders.map((order) => order.id);
    let orderItems: ItemRow[] = [];

    if (orderIds.length > 0) {
      const [itemRows] = await pool.query<ItemRow[]>(
        `
          SELECT
            oi.id,
            oi.order_id,
            oi.product_id,
            oi.product_name_snapshot AS product_name,
            oi.quantity
          FROM order_items oi
          WHERE oi.order_id IN (${buildInClause(orderIds)})
          ORDER BY oi.id ASC
        `,
        orderIds,
      );

      orderItems = itemRows;
    }

    const itemsByOrder = new Map<number, ItemRow[]>();

    for (const item of orderItems) {
      const bucket = itemsByOrder.get(item.order_id) ?? [];
      bucket.push(item);
      itemsByOrder.set(item.order_id, bucket);
    }

    return NextResponse.json({
      success: true,
      filters: {
        business_id: businessId,
        status: status || null,
        payment_method: paymentMethod || null,
        period,
        start_date: startDate || null,
        end_date: endDate || null,
      },
      businesses: businesses.map((business) => ({
        id: business.id,
        name: business.name,
      })),
      statuses: statusRows
        .map((row) => row.name)
        .filter((name): name is string => Boolean(name)),
      payment_methods: paymentMethodRows
        .map((row) => row.name)
        .filter((name): name is string => Boolean(name)),
      orders: orders.map((order) => ({
        id: order.id,
        customer_name: order.customer_name || "Cliente sin nombre",
        customer_email: order.customer_email || "",
        business_id: order.business_id,
        business_name: order.business_name || "Negocio sin nombre",
        current_delivery: order.delivery_id
          ? {
              id: Number(order.delivery_id),
              driver_user_id: Number(order.driver_user_id ?? 0) || null,
              driver_name: order.driver_name || "Repartidor asignado",
            }
          : null,
        products: (itemsByOrder.get(order.id) ?? []).map((item) => ({
          id: item.id,
          product_id: item.product_id,
          product_name: item.product_name || "Producto",
          quantity: item.quantity,
        })),
        total: toNumber(order.total_amount),
        payment_method: order.payment_method || "sin_definir",
        status: order.status_name || "pendiente",
        created_at: order.created_at,
        delivery_address: order.delivery_address || "Dirección no disponible",
      })),
    });
  } catch (error) {
    console.error("Error GET /api/admin/orders:", error);
    return NextResponse.json(
      {
        error: "No se pudieron cargar los pedidos del panel admin.",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}
