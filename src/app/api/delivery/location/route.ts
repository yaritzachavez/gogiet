import type { ResultSetHeader, RowDataPacket } from "mysql2/promise";
import { type NextRequest, NextResponse } from "next/server";

import { getAuthUser } from "@/lib/admin-security";
import pool from "@/lib/db";
import { resolveDeliveryAccess } from "@/lib/delivery-access";
import { ensureDriverLocationColumns } from "@/lib/driver-location";
import { normalizeDriverStatus } from "@/lib/driver-status";

type DriverLocationStateRow = RowDataPacket & {
  is_available: number | boolean | null;
  driver_status: string | null;
  active_deliveries: number | string | null;
};

function toCoordinate(value: unknown, min: number, max: number) {
  const coordinate = Number(value);

  if (!Number.isFinite(coordinate) || coordinate < min || coordinate > max) {
    return null;
  }

  return coordinate;
}

export async function PATCH(req: NextRequest) {
  const authUser = getAuthUser(req);

  if (!authUser?.user) {
    return NextResponse.json(
      { success: false, error: "Token inválido o faltante." },
      { status: 401 },
    );
  }

  const access = await resolveDeliveryAccess(authUser.user.id);

  if (!access.allowed) {
    return NextResponse.json(
      { success: false, error: "No autorizado." },
      { status: 403 },
    );
  }

  const body = (await req.json().catch(() => null)) as {
    latitude?: unknown;
    longitude?: unknown;
  } | null;
  const latitude = toCoordinate(body?.latitude, -90, 90);
  const longitude = toCoordinate(body?.longitude, -180, 180);

  if (latitude === null || longitude === null) {
    return NextResponse.json(
      { success: false, error: "Latitud o longitud inválida." },
      { status: 400 },
    );
  }

  await ensureDriverLocationColumns();

  const [rows] = await pool.query<DriverLocationStateRow[]>(
    `
      SELECT
        COALESCE(u.is_available, 1) AS is_available,
        u.driver_status,
        (
          SELECT COUNT(*)
          FROM delivery d
          LEFT JOIN delivery_status_catalog dsc ON dsc.id = d.delivery_status_id
          WHERE d.driver_user_id = u.id
            AND d.delivered_at IS NULL
            AND d.failed_at IS NULL
            AND COALESCE(dsc.is_final, 0) = 0
        ) AS active_deliveries
      FROM users u
      WHERE u.id = ?
      LIMIT 1
    `,
    [authUser.user.id],
  );
  const driver = rows[0] ?? null;
  const driverStatus = normalizeDriverStatus(
    driver?.driver_status,
    Boolean(driver?.is_available),
  );
  const hasActiveDelivery = Number(driver?.active_deliveries ?? 0) > 0;

  if (driverStatus === "OFFLINE" && !hasActiveDelivery) {
    return NextResponse.json({
      success: true,
      skipped: true,
      message: "Ubicación ignorada porque el repartidor está desconectado.",
    });
  }

  await pool.query<ResultSetHeader>(
    `
      UPDATE users
      SET
        last_latitude = ?,
        last_longitude = ?,
        last_location_at = NOW(),
        updated_at = NOW()
      WHERE id = ?
    `,
    [latitude, longitude, authUser.user.id],
  );

  return NextResponse.json({
    success: true,
    location: {
      latitude,
      longitude,
      updatedAt: new Date().toISOString(),
    },
  });
}
