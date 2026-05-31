import type { ResultSetHeader, RowDataPacket } from "mysql2/promise";
import { type NextRequest, NextResponse } from "next/server";

import { recordAuditLog } from "@/lib/audit-log";
import pool from "@/lib/db";
import {
  type DriverOperationalStatus,
  driverStatusToLabel,
  ensureDriverStatusColumns,
  isDriverAvailableStatus,
  normalizeDriverStatus,
} from "@/lib/driver-status";
import { requireAdminGeneral } from "@/lib/permissions";

type DriverRow = RowDataPacket & {
  id: number;
  status_id: number | null;
  is_available: number | boolean | null;
  driver_status: DriverOperationalStatus | string | null;
  driver_status_reason: string | null;
};

const VALID_STATUSES = new Set<DriverOperationalStatus>([
  "ACTIVE",
  "OFFLINE",
  "RESTING",
  "SUSPENDED",
  "DISABLED",
]);

function parseStatus(value: unknown): DriverOperationalStatus | null {
  const normalized = String(value ?? "")
    .trim()
    .toUpperCase();
  const alias =
    normalized === "DISCONNECTED" || normalized === "DESCONECTADO"
      ? "OFFLINE"
      : normalized;

  return VALID_STATUSES.has(alias as DriverOperationalStatus)
    ? (alias as DriverOperationalStatus)
    : null;
}

async function safeRecordAuditLog(
  input: Parameters<typeof recordAuditLog>[0],
  conn: Parameters<typeof recordAuditLog>[1],
) {
  try {
    await recordAuditLog(input, conn);
  } catch (error) {
    console.warn("No se pudo registrar audit_log de estado de repartidor:", {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdminGeneral(req);
  if (!auth.ok) return auth.response;

  const { id } = await context.params;
  const driverId = Number(id);

  if (!Number.isInteger(driverId) || driverId <= 0) {
    return NextResponse.json(
      { success: false, error: "ID de repartidor inválido." },
      { status: 400 },
    );
  }

  const body = (await req.json().catch(() => null)) as {
    status?: unknown;
    reason?: unknown;
  } | null;
  const nextStatus = parseStatus(body?.status);
  const reason = String(body?.reason ?? "").trim() || null;

  if (!nextStatus) {
    return NextResponse.json(
      {
        success: false,
        error:
          "Estado inválido. Usa ACTIVE, OFFLINE, RESTING, SUSPENDED o DISABLED.",
      },
      { status: 400 },
    );
  }

  const conn = await pool.getConnection();

  try {
    await ensureDriverStatusColumns(conn);
    await conn.beginTransaction();

    const [driverRows] = await conn.query<DriverRow[]>(
      `
        SELECT
          u.id,
          u.status_id,
          COALESCE(u.is_available, 1) AS is_available,
          u.driver_status,
          u.driver_status_reason
        FROM users u
        INNER JOIN user_roles ur ON ur.user_id = u.id
        INNER JOIN roles r ON r.id = ur.role_id
        WHERE u.id = ?
          AND LOWER(r.name) IN ('repartidor', 'delivery', 'driver')
        LIMIT 1
      `,
      [driverId],
    );
    const driver = driverRows[0] ?? null;

    if (!driver) {
      await conn.rollback();
      return NextResponse.json(
        { success: false, error: "Repartidor no encontrado." },
        { status: 404 },
      );
    }

    const previousStatus = normalizeDriverStatus(
      driver.driver_status,
      Boolean(driver.is_available),
    );
    const nextIsAvailable = isDriverAvailableStatus(nextStatus);

    await conn.query<ResultSetHeader>(
      `
        UPDATE users
        SET
          is_available = ?,
          driver_status = ?,
          driver_status_reason = ?,
          driver_active_since = CASE
            WHEN ? = 'ACTIVE'
              THEN COALESCE(driver_active_since, NOW())
            ELSE NULL
          END,
          updated_at = NOW()
        WHERE id = ?
      `,
      [nextIsAvailable ? 1 : 0, nextStatus, reason, nextStatus, driverId],
    );

    await safeRecordAuditLog(
      {
        userId: auth.access.userId,
        action: "UPDATE_DRIVER_OPERATIONAL_STATUS",
        resourceType: "driver",
        resourceId: driverId,
        oldValue: {
          driver_status: previousStatus,
          is_available: Boolean(driver.is_available),
          reason: driver.driver_status_reason,
        },
        newValue: {
          driver_status: nextStatus,
          is_available: nextIsAvailable,
          reason,
        },
        ip: req.headers.get("x-forwarded-for"),
        userAgent: req.headers.get("user-agent"),
      },
      conn,
    );

    await conn.commit();

    console.log("driver status sync", {
      userId: driverId,
      driverId,
      statusFromAdmin: driverStatusToLabel(nextStatus),
      statusFromDelivery: driverStatusToLabel(nextStatus),
      isAvailable: nextIsAvailable,
      statusId: driver.status_id,
    });

    return NextResponse.json({
      success: true,
      message: `Repartidor actualizado a ${driverStatusToLabel(nextStatus)}.`,
      driver: {
        id: driverId,
        status: driverStatusToLabel(nextStatus),
        driver_status: nextStatus,
        is_available: nextIsAvailable,
      },
    });
  } catch (error) {
    await conn.rollback();
    console.error("Error PATCH /api/admin/delivery/drivers/:id/status:", error);
    return NextResponse.json(
      { success: false, error: "No se pudo actualizar el repartidor." },
      { status: 500 },
    );
  } finally {
    conn.release();
  }
}
