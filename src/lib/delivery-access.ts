import type { RowDataPacket } from "mysql2/promise";

import pool from "@/lib/db";
import { normalizeRoleInput } from "@/lib/role-utils";

type DeliveryUserInfoRow = RowDataPacket & {
  email: string;
  role_name: string | null;
};

function isNonEmptyString(value: string | null): value is string {
  return typeof value === "string" && value.length > 0;
}

export async function resolveDeliveryAccess(userId: number) {
  const [userInfoRows] = await pool.query<DeliveryUserInfoRow[]>(
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
    .filter(isNonEmptyString)
    .map((role) => normalizeRoleInput(role))
    .filter(
      (role): role is NonNullable<ReturnType<typeof normalizeRoleInput>> =>
        Boolean(role),
    );

  const uniqueRoles = Array.from(new Set(roles));
  const allowed =
    uniqueRoles.includes("repartidor") || uniqueRoles.includes("admin_general");

  return {
    userId,
    email,
    roles: uniqueRoles,
    allowed,
  };
}
