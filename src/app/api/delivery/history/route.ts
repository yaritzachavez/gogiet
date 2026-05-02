import type { RowDataPacket } from "mysql2/promise";
import { type NextRequest, NextResponse } from "next/server";

import { getAuthUser } from "@/lib/admin-security";
import pool, { logDbUsage } from "@/lib/db";
import {
  COURIER_EARNING_RATE,
  getExistingColumns,
  pickFirstExistingColumn,
  SHIPPING_FEE_COLUMN_CANDIDATES,
  TIP_COLUMN_CANDIDATES,
} from "@/lib/delivery-fees";

type UserInfoRow = RowDataPacket & {
  email: string;
  role_name: string | null;
};

type TableExistsRow = RowDataPacket & {
  table_name: string;
};

type HistoryRow = RowDataPacket & {
  order_id: number;
  business_name: string;
  customer_name: string | null;
  customer_phone: string | null;
  street: string | null;
  external_number: string | null;
  internal_number: string | null;
  neighborhood: string | null;
  city: string | null;
  state: string | null;
  payment_method: string | null;
  total_amount: string | number | null;
  delivery_fee_amount: string | number | null;
  driver_earning_amount: string | number | null;
  tip_amount: string | number | null;
  delivered_at: string | null;
  order_status: string | null;
  delivery_status: string | null;
};

function isNonEmptyString(value: string | null): value is string {
  return typeof value === "string" && value.length > 0;
}

function toNumber(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function buildAddress(row: HistoryRow) {
  return [
    row.street?.trim(),
    row.external_number?.trim(),
    row.internal_number?.trim() ? `Int. ${row.internal_number.trim()}` : null,
    row.neighborhood?.trim(),
    row.city?.trim(),
    row.state?.trim(),
  ]
    .filter(Boolean)
    .join(", ");
}

export async function GET(req: NextRequest) {
  try {
    const authUser = getAuthUser(req);

    if (!authUser?.token) {
      return NextResponse.json(
        { success: false, error: "Token faltante", history: [] },
        { status: 401 },
      );
    }

    if (!authUser?.user) {
      return NextResponse.json(
        { success: false, error: "Token inválido", history: [] },
        { status: 401 },
      );
    }

    const userId = authUser.user.id;

    const [userInfoRows] = await pool.query<UserInfoRow[]>(
      `
        SELECT u.email, r.name AS role_name
        FROM users u
        LEFT JOIN user_roles ur ON ur.user_id = u.id
        LEFT JOIN roles r ON r.id = ur.role_id
        WHERE u.id = ?
      `,
      [userId],
    );

    const email = userInfoRows[0]?.email ?? null;
    const roles = userInfoRows
      .map((row) => row.role_name)
      .filter(isNonEmptyString);

    logDbUsage("/api/delivery/history", {
      userId,
      email,
      role: roles,
    });

    const [deliveryTableRows] = await pool.query<TableExistsRow[]>(
      `
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = DATABASE()
          AND table_name IN ('delivery_tips')
      `,
    );
    const availableTables = new Set(
      deliveryTableRows.map((row) => String(row.table_name).toLowerCase()),
    );

    const [deliveryColumnRows] = await pool.query<RowDataPacket[]>(
      `
        SELECT column_name
        FROM information_schema.columns
        WHERE table_schema = DATABASE()
          AND table_name = 'delivery'
          AND column_name IN ('completed_at', 'driver_earning')
      `,
    );
    const deliveryColumns = new Set(
      deliveryColumnRows.map((row) => String(row.column_name).toLowerCase()),
    );
    const orderColumns = await getExistingColumns(pool, "orders", [
      ...SHIPPING_FEE_COLUMN_CANDIDATES,
      ...TIP_COLUMN_CANDIDATES,
    ]);

    const shippingFeeColumn = pickFirstExistingColumn(
      orderColumns,
      SHIPPING_FEE_COLUMN_CANDIDATES,
    );
    const tipColumn = pickFirstExistingColumn(
      orderColumns,
      TIP_COLUMN_CANDIDATES,
    );
    const hasCompletedAt = deliveryColumns.has("completed_at");
    const hasDriverEarning = deliveryColumns.has("driver_earning");
    const completedAtExpression = hasCompletedAt
      ? "COALESCE(d.completed_at, d.delivered_at, o.delivered_at)"
      : "COALESCE(d.delivered_at, o.delivered_at)";
    const deliveryFeeExpression = shippingFeeColumn
      ? `COALESCE(o.${shippingFeeColumn}, 0)`
      : "0";
    const driverEarningExpression = hasDriverEarning
      ? `COALESCE(d.driver_earning, (${deliveryFeeExpression}) * ${COURIER_EARNING_RATE}, 0)`
      : `(${deliveryFeeExpression}) * ${COURIER_EARNING_RATE}`;
    const tipExpression = availableTables.has("delivery_tips")
      ? `COALESCE(dt.total_tip, ${tipColumn ? `o.${tipColumn}` : "0"}, 0)`
      : tipColumn
        ? `COALESCE(o.${tipColumn}, 0)`
        : "0";
    const tipJoin = availableTables.has("delivery_tips")
      ? `
        LEFT JOIN (
          SELECT delivery_id, SUM(amount) AS total_tip
          FROM delivery_tips
          GROUP BY delivery_id
        ) dt ON dt.delivery_id = d.id
      `
      : "";

    const [rows] = await pool.query<HistoryRow[]>(
      `
        SELECT
          o.id AS order_id,
          b.name AS business_name,
          TRIM(CONCAT_WS(' ', u.first_name, u.last_name)) AS customer_name,
          COALESCE(a.phone, u.phone) AS customer_phone,
          a.street,
          a.external_number,
          a.internal_number,
          a.neighborhood,
          a.city,
          a.state,
          COALESCE(o.payment_method, pm.name) AS payment_method,
          o.total_amount,
          ${deliveryFeeExpression} AS delivery_fee_amount,
          ${driverEarningExpression} AS driver_earning_amount,
          ${tipExpression} AS tip_amount,
          ${completedAtExpression} AS delivered_at,
          osc.name AS order_status,
          dsc.name AS delivery_status
        FROM delivery d
        INNER JOIN orders o ON o.id = d.order_id
        INNER JOIN business b ON b.id = o.business_id
        LEFT JOIN users u ON u.id = o.user_id
        LEFT JOIN addresses a ON a.id = o.address_id
        LEFT JOIN payment_methods pm ON pm.id = o.payment_method_id
        LEFT JOIN order_status_catalog osc ON osc.id = o.order_status_id
        LEFT JOIN delivery_status_catalog dsc ON dsc.id = d.delivery_status_id
        ${tipJoin}
        WHERE d.driver_user_id = ?
          AND ${completedAtExpression} IS NOT NULL
          AND (
            LOWER(COALESCE(dsc.name, '')) IN ('completado', 'entregado')
            OR LOWER(COALESCE(osc.name, '')) IN ('pedido_entregado', 'entregado')
          )
        ORDER BY ${completedAtExpression} DESC, o.id DESC
      `,
      [userId],
    );

    console.log("[delivery-history] repartidor autenticado:", {
      userId,
      email,
      roles,
    });
    console.log("[delivery-history] historial encontrado:", {
      total: rows.length,
      columnaDetectada: shippingFeeColumn,
      historyIds: rows.map((row) => Number(row.order_id)),
    });

    return NextResponse.json({
      success: true,
      history: rows.map((row) => ({
        id: String(row.order_id),
        folio: `FG-${String(row.order_id).padStart(4, "0")}`,
        businessName: row.business_name,
        customerName: row.customer_name ?? "Cliente",
        customerPhone: row.customer_phone ?? "",
        fullAddress: buildAddress(row),
        paymentMethod: row.payment_method ?? "Sin método",
        total: toNumber(row.total_amount),
        deliveryFee: toNumber(row.delivery_fee_amount),
        driverEarning: toNumber(row.driver_earning_amount),
        tip: toNumber(row.tip_amount),
        deliveredAt: String(row.delivered_at ?? ""),
        status: "Pedido entregado",
      })),
    });
  } catch (error) {
    console.error("Error GET /api/delivery/history:", error);
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "No se pudo cargar el historial del repartidor.",
        history: [],
      },
      { status: 500 },
    );
  }
}
