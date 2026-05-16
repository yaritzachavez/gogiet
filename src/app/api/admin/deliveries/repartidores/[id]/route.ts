import jwt from "jsonwebtoken";
import type { RowDataPacket } from "mysql2/promise";
import { type NextRequest, NextResponse } from "next/server";

import pool from "@/lib/db";

type JwtPayload = {
  id: number;
};

type CourierBaseRow = RowDataPacket & {
  id: number;
  name: string | null;
  phone: string | null;
  email: string | null;
  status_id: number | null;
  vehicle: string | null;
  zone: string | null;
  total_deliveries: number | string | null;
  deliveries_today: number | string | null;
  deliveries_week: number | string | null;
  deliveries_month: number | string | null;
  earnings: number | string | null;
  active_assignments: number | string | null;
};

type BusinessRow = RowDataPacket & {
  id: number;
  name: string;
};

type DeliveredOrderRow = RowDataPacket & {
  delivery_id: number;
  order_id: number;
  business_id: number | null;
  business_name: string | null;
  total_amount: string | number | null;
  courier_gain: string | number | null;
  payment_method: string | null;
  order_status: string | null;
  delivered_at: string | null;
  delivery_address: string | null;
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

function toStatusLabel(statusId: number, activeAssignments: number) {
  if (statusId !== 1) return "Suspendido";
  if (activeAssignments > 0) return "Activo";
  return "En descanso";
}

async function getCourierBase(courierId: number) {
  const today = new Date();
  const todayStart = new Date(
    today.getFullYear(),
    today.getMonth(),
    today.getDate(),
    0,
    0,
    0,
  );
  const todayEnd = new Date(
    today.getFullYear(),
    today.getMonth(),
    today.getDate(),
    23,
    59,
    59,
  );
  const weekStart = new Date(today);
  const weekDay = weekStart.getDay();
  const weekDiff = weekDay === 0 ? -6 : 1 - weekDay;
  weekStart.setDate(weekStart.getDate() + weekDiff);
  weekStart.setHours(0, 0, 0, 0);
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);

  const [rows] = await pool.query<CourierBaseRow[]>(
    `
      SELECT
        u.id,
        TRIM(CONCAT_WS(' ', u.first_name, u.last_name)) AS name,
        u.phone,
        u.email,
        u.status_id,
        (
          SELECT vt.name
          FROM delivery d2
          LEFT JOIN vehicle_types vt ON vt.id = d2.vehicle_type_id
          WHERE d2.driver_user_id = u.id
          ORDER BY d2.id DESC
          LIMIT 1
        ) AS vehicle,
        (
          SELECT COALESCE(b.city, a.city, 'Sin zona registrada')
          FROM delivery d3
          INNER JOIN orders o3 ON o3.id = d3.order_id
          LEFT JOIN business b ON b.id = o3.business_id
          LEFT JOIN addresses a ON a.id = o3.address_id
          WHERE d3.driver_user_id = u.id
          ORDER BY d3.id DESC
          LIMIT 1
        ) AS zone,
        (
          SELECT COUNT(*)
          FROM delivery d4
          WHERE d4.driver_user_id = u.id AND d4.delivered_at IS NOT NULL
        ) AS total_deliveries,
        (
          SELECT COUNT(*)
          FROM delivery d4
          WHERE d4.driver_user_id = u.id
            AND d4.delivered_at BETWEEN ? AND ?
        ) AS deliveries_today,
        (
          SELECT COUNT(*)
          FROM delivery d4
          WHERE d4.driver_user_id = u.id
            AND d4.delivered_at BETWEEN ? AND ?
        ) AS deliveries_week,
        (
          SELECT COUNT(*)
          FROM delivery d4
          WHERE d4.driver_user_id = u.id
            AND d4.delivered_at BETWEEN ? AND ?
        ) AS deliveries_month,
        (
          SELECT COALESCE(
            SUM(COALESCE(dp.total_amount, o4.delivery_fee, 0)),
            0
          )
          FROM delivery d4
          INNER JOIN orders o4 ON o4.id = d4.order_id
          LEFT JOIN (
            SELECT delivery_id, SUM(total_amount) AS total_amount
            FROM delivery_payments
            GROUP BY delivery_id
          ) dp ON dp.delivery_id = d4.id
          WHERE d4.driver_user_id = u.id
            AND d4.delivered_at IS NOT NULL
        ) AS earnings,
        (
          SELECT COUNT(*)
          FROM delivery d5
          LEFT JOIN delivery_status_catalog dsc ON dsc.id = d5.delivery_status_id
          WHERE d5.driver_user_id = u.id
            AND d5.delivered_at IS NULL
            AND d5.failed_at IS NULL
            AND COALESCE(dsc.is_final, 0) = 0
        ) AS active_assignments
      FROM users u
      INNER JOIN user_roles ur ON ur.user_id = u.id
      INNER JOIN roles r ON r.id = ur.role_id
      WHERE r.name = 'repartidor' AND u.id = ?
      LIMIT 1
    `,
    [
      todayStart,
      todayEnd,
      weekStart,
      todayEnd,
      monthStart,
      todayEnd,
      courierId,
    ],
  );

  return rows[0] ?? null;
}

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
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

    const { id } = await context.params;
    const courierId = Number(id);

    if (!Number.isInteger(courierId) || courierId <= 0) {
      return NextResponse.json({ error: "ID inválido" }, { status: 400 });
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

    const courier = await getCourierBase(courierId);

    if (!courier) {
      return NextResponse.json(
        { error: "Repartidor no encontrado" },
        { status: 404 },
      );
    }

    const [businesses] = await pool.query<BusinessRow[]>(
      `
        SELECT DISTINCT b.id, b.name
        FROM delivery d
        INNER JOIN orders o ON o.id = d.order_id
        INNER JOIN business b ON b.id = o.business_id
        WHERE d.driver_user_id = ?
        ORDER BY b.name ASC
      `,
      [courierId],
    );

    const filters = [
      "d.driver_user_id = ?",
      "COALESCE(d.delivered_at, o.delivered_at, d.created_at) BETWEEN ? AND ?",
      "COALESCE(d.delivered_at, o.delivered_at) IS NOT NULL",
    ];
    const values: Array<string | number> = [courierId, start, end];

    if (businessId) {
      filters.push("o.business_id = ?");
      values.push(businessId);
    }

    const whereClause = `WHERE ${filters.join(" AND ")}`;

    const [deliveredOrders] = await pool.query<DeliveredOrderRow[]>(
      `
        SELECT
          d.id AS delivery_id,
          o.id AS order_id,
          b.id AS business_id,
          b.name AS business_name,
          o.total_amount,
          COALESCE(dp.total_amount, o.delivery_fee, 0) AS courier_gain,
          COALESCE(o.payment_method, pm.name, 'sin_definir') AS payment_method,
          COALESCE(osc.name, 'pendiente') AS order_status,
          COALESCE(d.delivered_at, o.delivered_at, d.created_at) AS delivered_at,
          TRIM(
            CONCAT_WS(
              ', ',
              NULLIF(TRIM(CONCAT_WS(' ', a.street, a.external_number)), ''),
              NULLIF(a.neighborhood, ''),
              NULLIF(a.city, '')
            )
          ) AS delivery_address
        FROM delivery d
        INNER JOIN orders o ON o.id = d.order_id
        LEFT JOIN business b ON b.id = o.business_id
        LEFT JOIN addresses a ON a.id = o.address_id
        LEFT JOIN payment_methods pm ON pm.id = o.payment_method_id
        LEFT JOIN order_status_catalog osc ON osc.id = o.order_status_id
        LEFT JOIN (
          SELECT delivery_id, SUM(total_amount) AS total_amount
          FROM delivery_payments
          GROUP BY delivery_id
        ) dp ON dp.delivery_id = d.id
        ${whereClause}
        ORDER BY delivered_at DESC
        LIMIT 250
      `,
      values,
    );

    const filteredSummary = deliveredOrders.reduce(
      (accumulator, order) => {
        accumulator.total_deliveries += 1;
        accumulator.earnings += toNumber(order.courier_gain);
        return accumulator;
      },
      { total_deliveries: 0, earnings: 0 },
    );

    const activeAssignments = toNumber(courier.active_assignments);

    return NextResponse.json({
      success: true,
      courier: {
        id: courier.id,
        name: courier.name || "Repartidor sin nombre",
        phone: courier.phone || "",
        email: courier.email || "",
        status: toStatusLabel(toNumber(courier.status_id), activeAssignments),
        vehicle: courier.vehicle || "Sin vehículo registrado",
        zone: courier.zone || "Sin zona registrada",
        total_deliveries: toNumber(courier.total_deliveries),
        deliveries_today: toNumber(courier.deliveries_today),
        deliveries_week: toNumber(courier.deliveries_week),
        deliveries_month: toNumber(courier.deliveries_month),
        earnings: toNumber(courier.earnings),
        businesses: businesses.map((business) => ({
          id: business.id,
          name: business.name,
        })),
        delivered_orders: deliveredOrders.map((order) => ({
          delivery_id: order.delivery_id,
          order_id: order.order_id,
          business_id: order.business_id,
          business_name: order.business_name || "Negocio",
          total: toNumber(order.total_amount),
          courier_gain: toNumber(order.courier_gain),
          payment_method: order.payment_method || "sin_definir",
          status: order.order_status || "pendiente",
          delivered_at: order.delivered_at,
          delivery_address: order.delivery_address || "Dirección no disponible",
        })),
      },
      filtered_summary: filteredSummary,
      filters: {
        business_id: businessId,
        period,
        start_date: startDate || null,
        end_date: endDate || null,
      },
    });
  } catch (error) {
    console.error("Error GET /api/admin/deliveries/repartidores/[id]:", error);
    return NextResponse.json(
      {
        error: "No se pudo cargar el detalle del repartidor.",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}
