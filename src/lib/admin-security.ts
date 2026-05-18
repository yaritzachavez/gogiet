import jwt from "jsonwebtoken";
import type { ResultSetHeader, RowDataPacket } from "mysql2/promise";
import pool from "@/lib/db";
import { JWT_SECRET } from "@/lib/env";
import {
  assertColumnsExist,
  assertIndexesExist,
  assertTablesExist,
} from "@/lib/runtime-schema";

export type JwtPayload = {
  id: number;
};

export type SessionRow = RowDataPacket & {
  id: number;
  device_name: string | null;
  location: string | null;
  last_active_at: Date | string | null;
  status: string | null;
};

type AuthRequestLike = {
  headers: Pick<Headers, "get">;
  cookies?: {
    get: (name: string) => { value: string } | undefined;
  };
};

export function getAuthUser(req: AuthRequestLike) {
  const auth = req.headers.get("authorization");
  const bearerToken = auth?.startsWith("Bearer ")
    ? auth.split(" ")[1]?.trim()
    : null;
  const cookieToken = req.cookies?.get("authToken")?.value ?? null;
  const tokenCandidates = [bearerToken, cookieToken].filter(
    (value): value is string =>
      Boolean(
        value &&
          value !== "null" &&
          value !== "undefined" &&
          value.trim().length > 0,
      ),
  );
  const token = tokenCandidates[0] ?? null;

  if (!token) {
    return { token: null, user: null };
  }

  for (const candidate of tokenCandidates) {
    try {
      return {
        token: candidate,
        user: jwt.verify(candidate, JWT_SECRET) as JwtPayload,
      };
    } catch {}
  }

  return { token, user: null };
}

export async function isAdminGeneral(userId: number) {
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

export async function ensureAdminSettingsTable() {
  await assertTablesExist(pool, ["admin_settings"]);
  await assertColumnsExist(pool, "admin_settings", [
    "id",
    "user_id",
    "language",
    "timezone",
    "realtime_notifications",
    "dark_mode",
    "two_factor_enabled",
    "created_at",
    "updated_at",
  ]);
}

export async function ensureUserSessionsTable() {
  await assertTablesExist(pool, ["user_sessions"]);
  await assertColumnsExist(pool, "user_sessions", [
    "id",
    "user_id",
    "token",
    "device_name",
    "location",
    "last_active_at",
    "status",
    "created_at",
    "updated_at",
  ]);
  await assertIndexesExist(pool, "user_sessions", [
    "idx_user_sessions_user_id",
    "idx_user_sessions_status",
  ]);
}

export function getDeviceName(userAgent: string | null) {
  if (!userAgent) {
    return "Dispositivo desconocido";
  }

  const normalizedAgent = userAgent.toLowerCase();

  if (normalizedAgent.includes("iphone")) return "iPhone";
  if (normalizedAgent.includes("ipad")) return "iPad";
  if (normalizedAgent.includes("android")) return "Android";
  if (normalizedAgent.includes("mac os")) return "Mac";
  if (normalizedAgent.includes("windows")) return "Windows PC";
  if (normalizedAgent.includes("linux")) return "Linux";

  return "Navegador web";
}

export function getLocationLabel(ip: string | null) {
  if (!ip) {
    return "Ubicación no disponible";
  }

  return `IP ${ip}`;
}

export async function createUserSession(params: {
  userId: number;
  token: string;
  deviceName: string;
  location: string;
}) {
  await ensureUserSessionsTable();

  await pool.query<ResultSetHeader>(
    `
      INSERT INTO user_sessions (
        user_id,
        token,
        device_name,
        location,
        last_active_at,
        status
      )
      VALUES (?, ?, ?, ?, NOW(), 'active')
    `,
    [params.userId, params.token, params.deviceName, params.location],
  );
}
