import type { Pool, PoolConnection, RowDataPacket } from "mysql2/promise";

export const BUSINESS_TIME_ZONE = "America/Mexico_City";

export type BusinessHourRecord = {
  business_id?: number;
  day_of_week: number;
  open_time: string | Date | null;
  close_time: string | Date | null;
  is_closed?: number | boolean | null;
  is_24_hours?: number | boolean | null;
};

type BusinessHoursColumnRow = RowDataPacket & {
  column_name: string;
};

type BusinessHourRow = RowDataPacket &
  BusinessHourRecord & {
    business_id: number;
  };

type QueryExecutor = Pick<Pool | PoolConnection, "query">;

const DAY_INDEX_BY_SHORT_NAME: Record<string, number> = {
  Mon: 0,
  Tue: 1,
  Wed: 2,
  Thu: 3,
  Fri: 4,
  Sat: 5,
  Sun: 6,
};

export const BUSINESS_WEEK_DAYS = [
  "Lunes",
  "Martes",
  "Miércoles",
  "Jueves",
  "Viernes",
  "Sábado",
  "Domingo",
];

export async function ensureBusinessHoursSchema(executor: QueryExecutor) {
  const [columns] = await executor.query<BusinessHoursColumnRow[]>(
    `
      SELECT COLUMN_NAME AS column_name
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'business_hours'
        AND COLUMN_NAME = 'is_24_hours'
      LIMIT 1
    `,
  );

  if (columns.length === 0) {
    await executor.query(
      `
        ALTER TABLE business_hours
        ADD COLUMN is_24_hours BOOLEAN NOT NULL DEFAULT false AFTER is_closed
      `,
    );
  }
}

export function normalizeTimeValue(value: string | Date | null | undefined) {
  if (!value) return null;

  if (value instanceof Date) {
    return value.toISOString().slice(11, 16);
  }

  const text = String(value).trim();
  if (!text) return null;

  const match = text.match(/^(\d{1,2}):(\d{2})/);
  if (!match) return null;

  return `${match[1].padStart(2, "0")}:${match[2]}`;
}

export function getMexicoNowParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: BUSINESS_TIME_ZONE,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);

  const weekday = parts.find((part) => part.type === "weekday")?.value ?? "Mon";
  const hour = Number(parts.find((part) => part.type === "hour")?.value ?? 0);
  const minute = Number(
    parts.find((part) => part.type === "minute")?.value ?? 0,
  );

  return {
    dayOfWeek: DAY_INDEX_BY_SHORT_NAME[weekday] ?? 0,
    minutes: (hour === 24 ? 0 : hour) * 60 + minute,
  };
}

export function timeToMinutes(time: string | Date | null | undefined) {
  const normalized = normalizeTimeValue(time);
  if (!normalized) return null;

  const [hour, minute] = normalized.split(":").map(Number);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return null;

  return hour * 60 + minute;
}

export function isBusinessOpenByHours(params: {
  statusId?: number | null;
  fallbackOpen?: boolean;
  hours: BusinessHourRecord[];
  now?: Date;
}) {
  if (Number(params.statusId ?? 1) !== 1) {
    return false;
  }

  if (!params.hours.length) {
    return Boolean(params.fallbackOpen);
  }

  const nowParts = getMexicoNowParts(params.now);
  const today = params.hours.find(
    (hour) => Number(hour.day_of_week) === nowParts.dayOfWeek,
  );

  if (!today) return false;
  if (today.is_closed) return false;
  if (today.is_24_hours) return true;

  const openMinutes = timeToMinutes(today.open_time);
  const closeMinutes = timeToMinutes(today.close_time);

  if (openMinutes === null || closeMinutes === null) return false;

  return nowParts.minutes >= openMinutes && nowParts.minutes < closeMinutes;
}

export async function getBusinessOpenStatus(
  executor: QueryExecutor,
  businessId: number,
  options?: {
    statusId?: number | null;
    fallbackOpen?: boolean;
  },
) {
  await ensureBusinessHoursSchema(executor);

  const [hours] = await executor.query<BusinessHourRow[]>(
    `
      SELECT business_id, day_of_week, open_time, close_time, is_closed, is_24_hours
      FROM business_hours
      WHERE business_id = ?
      ORDER BY day_of_week ASC
    `,
    [businessId],
  );

  return isBusinessOpenByHours({
    statusId: options?.statusId,
    fallbackOpen: options?.fallbackOpen,
    hours,
  });
}

export async function getBusinessOpenStatuses(
  executor: QueryExecutor,
  businessIds: number[],
  businessState: Map<
    number,
    { statusId?: number | null; fallbackOpen?: boolean }
  >,
) {
  await ensureBusinessHoursSchema(executor);

  const uniqueBusinessIds = Array.from(
    new Set(
      businessIds.filter(
        (businessId) => Number.isFinite(businessId) && businessId > 0,
      ),
    ),
  );
  const statusMap = new Map<number, boolean>();

  if (uniqueBusinessIds.length === 0) {
    return statusMap;
  }

  const [hours] = await executor.query<BusinessHourRow[]>(
    `
      SELECT business_id, day_of_week, open_time, close_time, is_closed, is_24_hours
      FROM business_hours
      WHERE business_id IN (${uniqueBusinessIds.map(() => "?").join(",")})
      ORDER BY business_id ASC, day_of_week ASC
    `,
    uniqueBusinessIds,
  );

  for (const businessId of uniqueBusinessIds) {
    const state = businessState.get(businessId);
    statusMap.set(
      businessId,
      isBusinessOpenByHours({
        statusId: state?.statusId,
        fallbackOpen: state?.fallbackOpen,
        hours: hours.filter((hour) => Number(hour.business_id) === businessId),
      }),
    );
  }

  return statusMap;
}
