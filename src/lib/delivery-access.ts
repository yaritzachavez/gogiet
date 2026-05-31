import type { RowDataPacket } from "mysql2/promise";

import pool from "@/lib/db";
import {
  isDriverAvailableStatus,
  normalizeDriverStatus,
} from "@/lib/driver-status";
import { normalizeRoleInput } from "@/lib/role-utils";

type DeliveryUserInfoRow = RowDataPacket & {
  email: string;
  is_available: number | boolean | null;
  driver_status: string | null;
  role_name: string | null;
};

function isNonEmptyString(value: string | null): value is string {
  return typeof value === "string" && value.length > 0;
}

export async function resolveDeliveryAccess(userId: number) {
  const [userInfoRows] = await pool.query<DeliveryUserInfoRow[]>(
    `
      SELECT
        u.email,
        COALESCE(u.is_available, 1) AS is_available,
        u.driver_status,
        r.name AS role_name
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
    .filter(isNonEmptyString)
    .map((role) => normalizeRoleInput(role))
    .filter(
      (role): role is NonNullable<ReturnType<typeof normalizeRoleInput>> =>
        Boolean(role),
    );

  const uniqueRoles = Array.from(new Set(roles));
  const allowed = uniqueRoles.includes("repartidor");
  const operationalStatus = normalizeDriverStatus(
    userInfoRows[0]?.driver_status,
    Boolean(userInfoRows[0]?.is_available),
  );
  const canOperate = allowed && isDriverAvailableStatus(operationalStatus);

  return {
    userId,
    email,
    roles: uniqueRoles,
    allowed,
    operationalStatus,
    canOperate,
  };
}
