import type { RowDataPacket } from "mysql2/promise";
import { type NextRequest, NextResponse } from "next/server";

import { getAuthUser } from "@/lib/admin-security";
import pool, { logDbUsage } from "@/lib/db";
import { resolveDeliveryAccess } from "@/lib/delivery-access";
import {
  COURIER_EARNING_RATE,
  DEFAULT_DELIVERY_FEE_RATE,
  getExistingColumns,
  getShippingFeeSourceLabel,
  getShippingFeeSqlExpression,
  pickFirstExistingColumn,
  SHIPPING_FEE_COLUMN_CANDIDATES,
  TIP_COLUMN_CANDIDATES,
} from "@/lib/delivery-fees";

type TableExistsRow = RowDataPacket & {
  table_name: string;
};

type ColumnExistsRow = RowDataPacket & {
  column_name: string;
};

type DeliveredEarningRow = RowDataPacket & {
  delivery_id: number;
  order_id: number;
  delivered_at: string | null;
  shipping_fee_amount: string | number | null;
  courier_gain: string | number | null;
  courier_tip: string | number | null;
};

const WEEKLY_GOAL = 4500;

function toNumber(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function startOfDay(date: Date) {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
}

function endOfDay(date: Date) {
  const next = new Date(date);
  next.setHours(23, 59, 59, 999);
  return next;
}

function startOfWeek(date: Date) {
  const next = startOfDay(date);
  const day = next.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  next.setDate(next.getDate() + diff);
  return next;
}

function isWithinRange(dateValue: string | null, start: Date, end: Date) {
  if (!dateValue) return false;

  const current = new Date(dateValue);
  if (Number.isNaN(current.getTime())) return false;

  return current >= start && current <= end;
}

export async function GET(req: NextRequest) {
  try {
    const authUser = getAuthUser(req);

    if (!authUser?.token) {
      return NextResponse.json(
        { success: false, error: "Token faltante", earnings: null },
        { status: 401 },
      );
    }

    if (!authUser?.user) {
      return NextResponse.json(
        { success: false, error: "Token inválido", earnings: null },
        { status: 401 },
      );
    }

    const userId = authUser.user.id;
    const access = await resolveDeliveryAccess(userId);

    console.log("[delivery-earnings] repartidor autenticado:", {
      userId,
      email: access.email,
      roles: access.roles,
    });

    if (!access.allowed) {
      return NextResponse.json(
        {
          success: false,
          error: "No autorizado para acceder al panel de repartidor",
          earnings: null,
        },
        { status: 403 },
      );
    }

    logDbUsage("/api/delivery/earnings", {
      userId,
      email: access.email,
      role: access.roles,
    });

    const [tableRows] = await pool.query<TableExistsRow[]>(
      `
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = DATABASE()
          AND table_name IN ('delivery_payments', 'delivery_tips')
      `,
    );

    const availableTables = new Set(
      tableRows.map((row) => String(row.table_name).toLowerCase()),
    );

    const [deliveryColumnRows] = await pool.query<ColumnExistsRow[]>(
      `
        SELECT column_name
        FROM information_schema.columns
        WHERE table_schema = DATABASE()
          AND table_name = 'delivery'
          AND column_name IN ('driver_earning')
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
    const hasDriverEarning = deliveryColumns.has("driver_earning");
    const shippingFeeExpression =
      getShippingFeeSqlExpression(shippingFeeColumn);
    const shippingFeeSource = getShippingFeeSourceLabel(shippingFeeColumn);

    const gainExpression = hasDriverEarning
      ? `COALESCE(d.driver_earning, (${shippingFeeExpression}) * ${COURIER_EARNING_RATE}, 0)`
      : `(${shippingFeeExpression}) * ${COURIER_EARNING_RATE}`;
    const tipExpression = availableTables.has("delivery_tips")
      ? `COALESCE(
          dt.total_tip,
          ${tipColumn ? `o.${tipColumn}` : "0"},
          0
        )`
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

    const [rows] = await pool.query<DeliveredEarningRow[]>(
      `
        SELECT
          d.id AS delivery_id,
          o.id AS order_id,
          COALESCE(d.delivered_at, o.delivered_at) AS delivered_at,
          ${shippingFeeExpression} AS shipping_fee_amount,
          ${gainExpression} AS courier_gain,
          ${tipExpression} AS courier_tip
        FROM delivery d
        INNER JOIN orders o ON o.id = d.order_id
        ${tipJoin}
        WHERE d.driver_user_id = ?
          AND COALESCE(d.delivered_at, o.delivered_at) IS NOT NULL
        ORDER BY COALESCE(d.delivered_at, o.delivered_at) DESC
      `,
      [userId],
    );

    console.log("[delivery-earnings] entregas encontradas:", {
      userId,
      total: rows.length,
      deliveryIds: rows.map((row) => Number(row.delivery_id)),
      columnaDetectada: shippingFeeColumn,
      fuenteEnvio: shippingFeeSource,
      tipColumn,
      usesStoredDriverEarning: hasDriverEarning,
      deliveryFeeFallbackRate: DEFAULT_DELIVERY_FEE_RATE,
      courierEarningRate: COURIER_EARNING_RATE,
      muestras: rows.slice(0, 5).map((row) => ({
        orderId: Number(row.order_id),
        valorEnvio: toNumber(row.shipping_fee_amount),
        gananciaCalculada: toNumber(row.courier_gain),
      })),
    });

    const now = new Date();
    const todayStart = startOfDay(now);
    const todayEnd = endOfDay(now);
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStart = startOfDay(yesterday);
    const yesterdayEnd = endOfDay(yesterday);
    const weekStart = startOfWeek(now);

    let gananciasHoy = 0;
    let gananciasSemana = 0;
    let propinasSemana = 0;
    let gananciasAyer = 0;

    for (const row of rows) {
      const gain = toNumber(row.courier_gain);
      const tip = toNumber(row.courier_tip);
      const deliveredAt = row.delivered_at;

      if (isWithinRange(deliveredAt, todayStart, todayEnd)) {
        gananciasHoy += gain;
      }

      if (isWithinRange(deliveredAt, weekStart, todayEnd)) {
        gananciasSemana += gain;
        propinasSemana += tip;
      }

      if (isWithinRange(deliveredAt, yesterdayStart, yesterdayEnd)) {
        gananciasAyer += gain;
      }
    }

    const porcentajeObjetivo =
      WEEKLY_GOAL > 0 ? (gananciasSemana / WEEKLY_GOAL) * 100 : 0;
    const comparacionAyer =
      gananciasAyer > 0
        ? ((gananciasHoy - gananciasAyer) / gananciasAyer) * 100
        : gananciasHoy > 0
          ? 100
          : 0;

    const earnings = {
      currency: "MXN",
      today: Number(gananciasHoy.toFixed(2)),
      weekToDate: Number(gananciasSemana.toFixed(2)),
      tips: Number(propinasSemana.toFixed(2)),
      goal: WEEKLY_GOAL,
      percentageToGoal: Number(porcentajeObjetivo.toFixed(2)),
      comparisonToYesterday: Number(comparacionAyer.toFixed(2)),
    };

    console.log("[delivery-earnings] ganancias calculadas:", {
      gananciasHoy,
      propinasSemana,
      gananciasSemana,
      objetivoSemanal: WEEKLY_GOAL,
      porcentajeObjetivo,
      comparacionAyer,
    });
    console.log("[delivery-earnings] respuesta final de earnings:", earnings);

    return NextResponse.json({
      success: true,
      earnings,
      columnsUsed: {
        courierGain: hasDriverEarning
          ? [
              "delivery.driver_earning",
              `${shippingFeeSource} * ${COURIER_EARNING_RATE}`,
            ]
          : [`${shippingFeeSource} * ${COURIER_EARNING_RATE}`],
        tips: tipExpression.includes("dt.total_tip")
          ? ["delivery_tips.amount", tipColumn ? `orders.${tipColumn}` : "0"]
          : tipColumn
            ? [`orders.${tipColumn}`]
            : [],
      },
    });
  } catch (error) {
    console.error("Error GET /api/delivery/earnings:", error);
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "No se pudieron calcular las ganancias del repartidor.",
        earnings: null,
      },
      { status: 500 },
    );
  }
}
