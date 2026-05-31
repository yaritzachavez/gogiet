import type { RowDataPacket } from "mysql2/promise";
import { type NextRequest, NextResponse } from "next/server";

import {
  BUSINESS_WEEK_DAYS,
  ensureBusinessHoursSchema,
  getBusinessOpenStatus,
  normalizeTimeValue,
  timeToMinutes,
} from "@/lib/business-hours";
import pool from "@/lib/db";
import { requireBusinessAccess } from "@/lib/permissions";

type BusinessHourRow = RowDataPacket & {
  day_of_week: number;
  open_time: string | null;
  close_time: string | null;
  is_closed: number | boolean | null;
  is_24_hours: number | boolean | null;
};

type BusinessStatusRow = RowDataPacket & {
  status_id: number | null;
  is_open: number | boolean | null;
};

type IncomingBusinessHour = {
  dayOfWeek?: unknown;
  day_of_week?: unknown;
  isOpen?: unknown;
  is_open?: unknown;
  isClosed?: unknown;
  is_closed?: unknown;
  openTime?: unknown;
  open_time?: unknown;
  closeTime?: unknown;
  close_time?: unknown;
  is24Hours?: unknown;
  is_24_hours?: unknown;
};

type NormalizedBusinessHour = {
  dayOfWeek: number;
  isClosed: boolean;
  is24Hours: boolean;
  openTime: string | null;
  closeTime: string | null;
};

function parseBusinessId(value: string) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function isValidTime(value: string | null) {
  return value !== null && /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

function normalizeHour(input: IncomingBusinessHour): NormalizedBusinessHour {
  const dayOfWeek = Number(input.dayOfWeek ?? input.day_of_week);
  const is24Hours = Boolean(input.is24Hours ?? input.is_24_hours);
  const isOpen =
    input.isOpen !== undefined || input.is_open !== undefined
      ? Boolean(input.isOpen ?? input.is_open)
      : !(input.isClosed ?? input.is_closed);
  const isClosed = !isOpen;

  const openTime = is24Hours
    ? "00:00"
    : normalizeTimeValue(
        typeof input.openTime === "string"
          ? input.openTime
          : typeof input.open_time === "string"
            ? input.open_time
            : null,
      );
  const closeTime = is24Hours
    ? "23:59"
    : normalizeTimeValue(
        typeof input.closeTime === "string"
          ? input.closeTime
          : typeof input.close_time === "string"
            ? input.close_time
            : null,
      );

  return {
    dayOfWeek,
    isClosed,
    is24Hours,
    openTime: isClosed ? null : openTime,
    closeTime: isClosed ? null : closeTime,
  };
}

async function getBusinessState(businessId: number) {
  const [rows] = await pool.query<BusinessStatusRow[]>(
    `
      SELECT status_id, is_open
      FROM business
      WHERE id = ?
      LIMIT 1
    `,
    [businessId],
  );

  return rows[0] ?? null;
}

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const businessId = parseBusinessId(id);

    if (!businessId) {
      return NextResponse.json(
        { success: false, error: "ID de negocio inválido" },
        { status: 400 },
      );
    }

    const auth = await requireBusinessAccess(req, businessId);

    if (!auth.ok) {
      return auth.response;
    }

    await ensureBusinessHoursSchema(pool);

    const [rows] = await pool.query<BusinessHourRow[]>(
      `
        SELECT day_of_week, open_time, close_time, is_closed, is_24_hours
        FROM business_hours
        WHERE business_id = ?
        ORDER BY day_of_week ASC
      `,
      [businessId],
    );

    const businessState = await getBusinessState(businessId);
    const isOpenNow = await getBusinessOpenStatus(pool, businessId, {
      statusId: Number(businessState?.status_id ?? 1),
      fallbackOpen: Boolean(businessState?.is_open),
    });

    return NextResponse.json({
      success: true,
      is_open_now: isOpenNow,
      hours: BUSINESS_WEEK_DAYS.map((dayName, dayOfWeek) => {
        const row = rows.find((hour) => Number(hour.day_of_week) === dayOfWeek);

        return {
          day_of_week: dayOfWeek,
          dayOfWeek,
          day_name: dayName,
          is_open: row ? !row.is_closed : false,
          isOpen: row ? !row.is_closed : false,
          open_time: normalizeTimeValue(row?.open_time) ?? "09:00",
          openTime: normalizeTimeValue(row?.open_time) ?? "09:00",
          close_time: normalizeTimeValue(row?.close_time) ?? "20:00",
          closeTime: normalizeTimeValue(row?.close_time) ?? "20:00",
          is_24_hours: Boolean(row?.is_24_hours),
          is24Hours: Boolean(row?.is_24_hours),
        };
      }),
    });
  } catch (error) {
    console.error("Error GET /api/business/[id]/hours:", error);
    return NextResponse.json(
      { success: false, error: "No se pudieron cargar los horarios." },
      { status: 500 },
    );
  }
}

export async function PUT(
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const connection = await pool.getConnection();

  try {
    const { id } = await context.params;
    const businessId = parseBusinessId(id);

    if (!businessId) {
      return NextResponse.json(
        { success: false, error: "ID de negocio inválido" },
        { status: 400 },
      );
    }

    const auth = await requireBusinessAccess(req, businessId);

    if (!auth.ok) {
      return auth.response;
    }

    const body = await req.json();
    const rawHours: unknown[] | null = Array.isArray(body?.hours)
      ? body.hours
      : null;

    if (!rawHours || rawHours.length !== 7) {
      return NextResponse.json(
        {
          success: false,
          error: "Debes enviar horarios para los 7 días de la semana.",
        },
        { status: 400 },
      );
    }

    const normalizedHours: NormalizedBusinessHour[] = rawHours.map((hour) =>
      normalizeHour(hour as IncomingBusinessHour),
    );
    const seenDays = new Set<number>();

    for (const hour of normalizedHours) {
      if (
        !Number.isInteger(hour.dayOfWeek) ||
        hour.dayOfWeek < 0 ||
        hour.dayOfWeek > 6 ||
        seenDays.has(hour.dayOfWeek)
      ) {
        return NextResponse.json(
          { success: false, error: "Los días enviados no son válidos." },
          { status: 400 },
        );
      }

      seenDays.add(hour.dayOfWeek);

      if (hour.isClosed) {
        continue;
      }

      if (!isValidTime(hour.openTime) || !isValidTime(hour.closeTime)) {
        return NextResponse.json(
          {
            success: false,
            error: `Configura apertura y cierre para ${BUSINESS_WEEK_DAYS[hour.dayOfWeek]}.`,
          },
          { status: 400 },
        );
      }

      const openMinutes = timeToMinutes(hour.openTime);
      const closeMinutes = timeToMinutes(hour.closeTime);

      if (
        openMinutes === null ||
        closeMinutes === null ||
        (!hour.is24Hours && closeMinutes <= openMinutes)
      ) {
        return NextResponse.json(
          {
            success: false,
            error: `La hora de cierre debe ser mayor a la apertura en ${BUSINESS_WEEK_DAYS[hour.dayOfWeek]}.`,
          },
          { status: 400 },
        );
      }
    }

    await ensureBusinessHoursSchema(connection);
    await connection.beginTransaction();

    for (const hour of normalizedHours) {
      await connection.query(
        `
          INSERT INTO business_hours (
            business_id,
            day_of_week,
            open_time,
            close_time,
            is_closed,
            is_24_hours,
            created_at,
            updated_at
          )
          VALUES (?, ?, ?, ?, ?, ?, NOW(), NOW())
          ON DUPLICATE KEY UPDATE
            open_time = VALUES(open_time),
            close_time = VALUES(close_time),
            is_closed = VALUES(is_closed),
            is_24_hours = VALUES(is_24_hours),
            updated_at = NOW()
        `,
        [
          businessId,
          hour.dayOfWeek,
          hour.openTime,
          hour.closeTime,
          hour.isClosed ? 1 : 0,
          hour.is24Hours ? 1 : 0,
        ],
      );
    }

    await connection.commit();

    const businessState = await getBusinessState(businessId);
    const isOpenNow = await getBusinessOpenStatus(pool, businessId, {
      statusId: Number(businessState?.status_id ?? 1),
      fallbackOpen: Boolean(businessState?.is_open),
    });

    return NextResponse.json({
      success: true,
      is_open_now: isOpenNow,
      message: "Horarios guardados correctamente.",
    });
  } catch (error) {
    await connection.rollback();
    console.error("Error PUT /api/business/[id]/hours:", error);
    return NextResponse.json(
      { success: false, error: "No se pudieron guardar los horarios." },
      { status: 500 },
    );
  } finally {
    connection.release();
  }
}
