import jwt from "jsonwebtoken";
import type { RowDataPacket } from "mysql2/promise";
import { type NextRequest, NextResponse } from "next/server";

import { legacyErrorResponse } from "@/lib/api-error";
import pool from "@/lib/db";
import { getDriverLocationColumns } from "@/lib/driver-location";
import {
  type DriverOperationalStatus,
  driverStatusToLabel,
  getDriverStatusColumns,
  isDriverAvailableStatus,
  normalizeDriverStatus,
} from "@/lib/driver-status";
import { JWT_SECRET } from "@/lib/env";
import {
  buildUserAvatarSelect,
  ensureUserAvatarColumn,
} from "@/lib/user-avatar";

type JwtPayload = {
  id: number;
};

type CourierRow = RowDataPacket & {
  id: number;
  name: string | null;
  profile_image_url: string | null;
  phone: string | null;
  email: string | null;
  status_id: number | null;
  is_available: number | boolean | null;
  driver_status: DriverOperationalStatus | string | null;
  last_latitude: string | number | null;
  last_longitude: string | number | null;
  last_location_at: string | null;
  vehicle: string | null;
  zone: string | null;
  total_deliveries: number | string | null;
  deliveries_today: number | string | null;
  deliveries_week: number | string | null;
  deliveries_month: number | string | null;
  earnings: number | string | null;
  active_assignments: number | string | null;
};

function getAuthUser(req: NextRequest) {
  const auth = req.headers.get("authorization");
  const token = auth?.startsWith("Bearer ")
    ? auth.split(" ")[1]
    : req.cookies.get("authToken")?.value;

  if (!token) return null;

  try {
    return jwt.verify(token, JWT_SECRET) as JwtPayload;
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

function toNumber(value: string | number | null | undefined) {
  return Number(value ?? 0);
}

function toStatusLabel(isAvailable: boolean, driverStatus: unknown) {
  return driverStatusToLabel(normalizeDriverStatus(driverStatus, isAvailable));
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
    const avatarColumns = await ensureUserAvatarColumn();
    const avatarSelect = buildUserAvatarSelect("u", avatarColumns);
    const driverStatusColumns = await getDriverStatusColumns();
    const driverStatusSelect = driverStatusColumns.hasDriverStatus
      ? "u.driver_status"
      : "NULL AS driver_status";
    const locationColumns = await getDriverLocationColumns();
    const locationSelect = [
      locationColumns.hasLatitude ? "u.last_latitude" : "NULL AS last_latitude",
      locationColumns.hasLongitude
        ? "u.last_longitude"
        : "NULL AS last_longitude",
      locationColumns.hasUpdatedAt
        ? "u.last_location_at"
        : "NULL AS last_location_at",
    ].join(",\n          ");

    const [rows] = await pool.query<CourierRow[]>(
      `
        SELECT
          u.id,
          TRIM(CONCAT_WS(' ', u.first_name, u.last_name)) AS name,
          ${avatarSelect},
          u.phone,
          u.email,
          u.status_id,
          COALESCE(u.is_available, 1) AS is_available,
          ${driverStatusSelect},
          ${locationSelect},
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
        WHERE r.name = 'repartidor'
        ORDER BY name ASC, u.id ASC
      `,
      [todayStart, todayEnd, weekStart, todayEnd, monthStart, todayEnd],
    );

    const couriers = rows.map((row) => {
      const activeAssignments = toNumber(row.active_assignments);
      const driverStatus = normalizeDriverStatus(
        row.driver_status,
        Boolean(row.is_available),
      );
      const isAvailable = isDriverAvailableStatus(driverStatus);
      const status = toStatusLabel(isAvailable, driverStatus);
      console.log("driver status sync", {
        userId: row.id,
        driverId: row.id,
        statusFromAdmin: status,
        statusFromDelivery: status,
        isAvailable,
        statusId: row.status_id,
        driverStatus,
      });
      return {
        id: row.id,
        name: row.name || "Repartidor sin nombre",
        profile_image_url: row.profile_image_url ?? null,
        phone: row.phone || "",
        email: row.email || "",
        status,
        vehicle: row.vehicle || "Sin vehículo registrado",
        zone: row.zone || "Sin zona registrada",
        last_location:
          row.last_latitude != null && row.last_longitude != null
            ? {
                latitude: Number(row.last_latitude),
                longitude: Number(row.last_longitude),
                updatedAt: row.last_location_at ?? null,
              }
            : null,
        total_deliveries: toNumber(row.total_deliveries),
        deliveries_today: toNumber(row.deliveries_today),
        deliveries_week: toNumber(row.deliveries_week),
        deliveries_month: toNumber(row.deliveries_month),
        earnings: toNumber(row.earnings),
        active_assignments: activeAssignments,
      };
    });

    return NextResponse.json({
      success: true,
      couriers,
      summary: {
        total: couriers.length,
        activos: couriers.filter((courier) => courier.status === "Activo")
          .length,
        desconectados: couriers.filter(
          (courier) => courier.status === "Desconectado",
        ).length,
        descanso: couriers.filter((courier) => courier.status === "En descanso")
          .length,
        suspendidos: couriers.filter(
          (courier) => courier.status === "Suspendido",
        ).length,
      },
    });
  } catch (error) {
    return legacyErrorResponse(req, {
      event: "admin.delivery_couriers_error",
      error,
      message: "No se pudieron cargar los repartidores.",
    });
  }
}
