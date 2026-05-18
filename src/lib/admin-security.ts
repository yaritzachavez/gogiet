import { createHash } from "node:crypto";

import jwt from "jsonwebtoken";
import type { ResultSetHeader, RowDataPacket } from "mysql2/promise";
import pool from "@/lib/db";
import { JWT_SECRET } from "@/lib/env";
import { logger } from "@/lib/logger";
import {
  assertColumnsExist,
  assertTablesExist,
  RuntimeSchemaError,
} from "@/lib/runtime-schema";

export type JwtPayload = {
  id: number;
};

export type SessionRow = RowDataPacket & {
  id: number;
  device_name: string | null;
  location: string | null;
  last_active_at: Date | string | null;
  expires_at: Date | string | null;
  status: string | null;
};

type AuthRequestLike = {
  headers: Pick<Headers, "get">;
  cookies?: {
    get: (name: string) => { value: string } | undefined;
  };
};

export type UserSessionsSchema = {
  tokenColumn: "session_token_hash" | "token";
  hasDeviceName: boolean;
  hasLocation: boolean;
  hasLastActiveAt: boolean;
  hasExpiresAt: boolean;
  hasRevokedAt: boolean;
  hasStatus: boolean;
  hasUpdatedAt: boolean;
};

export type SessionDiagnostics = {
  found: boolean;
  sessionId: number | null;
  userId: number | null;
  expired: boolean;
  revoked: boolean;
  status: string | null;
  expiresAt: Date | string | null;
};

let cachedUserSessionsSchema: UserSessionsSchema | null = null;
let loggedUserSessionsSchemaCheck = false;

export function hashSessionToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export async function getUserSessionsSchema() {
  if (cachedUserSessionsSchema) {
    return cachedUserSessionsSchema;
  }

  const [databaseRows] = await pool.query<RowDataPacket[]>(
    "SELECT DATABASE() AS db_name",
  );
  const [tableRows] = await pool.query<RowDataPacket[]>("SHOW TABLES LIKE ?", [
    "user_sessions",
  ]);
  const hasSessionTable = tableRows.length > 0;

  if (!loggedUserSessionsSchemaCheck) {
    logger.warn(
      "auth.user_sessions_runtime_check",
      "[auth-schema] verificación runtime de user_sessions",
      {
        databaseName:
          typeof databaseRows[0]?.db_name === "string"
            ? databaseRows[0].db_name
            : null,
        hasSessionTable: Boolean(hasSessionTable),
      },
    );
    loggedUserSessionsSchemaCheck = true;
  }

  if (!hasSessionTable) {
    throw new RuntimeSchemaError(
      "Falta tabla requerida en runtime: user_sessions. Ejecuta migraciones con prisma migrate deploy antes de atender tráfico.",
    );
  }

  const [rows] = await pool.query<RowDataPacket[]>(
    "SHOW COLUMNS FROM user_sessions",
  );
  const columns = new Set(
    rows
      .map((row) =>
        String(row.Field ?? "")
          .trim()
          .toLowerCase(),
      )
      .filter(Boolean),
  );

  const tokenColumn = columns.has("session_token_hash")
    ? "session_token_hash"
    : columns.has("token")
      ? "token"
      : null;

  if (!tokenColumn) {
    throw new RuntimeSchemaError(
      "La tabla user_sessions no tiene una columna compatible de token de sesión.",
    );
  }

  cachedUserSessionsSchema = {
    tokenColumn,
    hasDeviceName: columns.has("device_name"),
    hasLocation: columns.has("location"),
    hasLastActiveAt: columns.has("last_active_at"),
    hasExpiresAt: columns.has("expires_at"),
    hasRevokedAt: columns.has("revoked_at"),
    hasStatus: columns.has("status"),
    hasUpdatedAt: columns.has("updated_at"),
  };

  logger.warn(
    "auth.user_sessions_schema_detected",
    "[auth-schema] esquema de user_sessions detectado",
    {
      tokenStorageMode:
        tokenColumn === "session_token_hash" ? "hash" : "legacy",
      hasSessionTable: true,
      hasDeviceName: columns.has("device_name"),
      hasLocation: columns.has("location"),
      hasLastActiveAt: columns.has("last_active_at"),
      hasExpiresAt: columns.has("expires_at"),
      hasRevokedAt: columns.has("revoked_at"),
      hasStatus: columns.has("status"),
      hasUpdatedAt: columns.has("updated_at"),
    },
  );

  return cachedUserSessionsSchema;
}

export function getPersistedSessionTokenValue(
  token: string,
  schema: UserSessionsSchema,
) {
  return schema.tokenColumn === "session_token_hash"
    ? hashSessionToken(token)
    : token;
}

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
  expiresAt: Date;
}) {
  const schema = await getUserSessionsSchema();
  const columns = ["user_id", schema.tokenColumn];
  const values: Array<string | number | Date | null> = [
    params.userId,
    getPersistedSessionTokenValue(params.token, schema),
  ];

  if (schema.hasDeviceName) {
    columns.push("device_name");
    values.push(params.deviceName);
  }

  if (schema.hasLocation) {
    columns.push("location");
    values.push(params.location);
  }

  if (schema.hasLastActiveAt) {
    columns.push("last_active_at");
  }

  if (schema.hasExpiresAt) {
    columns.push("expires_at");
    values.push(params.expiresAt);
  }

  if (schema.hasStatus) {
    columns.push("status");
    values.push("active");
  }

  const placeholders = columns.map((columnName) =>
    columnName === "last_active_at" ? "NOW()" : "?",
  );

  const [result] = await pool.query<ResultSetHeader>(
    `
      INSERT INTO user_sessions (
        ${columns.join(", ")}
      )
      VALUES (${placeholders.join(", ")})
    `,
    values,
  );

  return {
    sessionId: Number(result.insertId ?? 0) || null,
    tokenColumn: schema.tokenColumn,
    expiresAt: params.expiresAt,
  };
}

export async function getSessionDiagnostics(token: string) {
  const schema = await getUserSessionsSchema();
  const persistedToken = getPersistedSessionTokenValue(token, schema);
  const [rows] = await pool.query<RowDataPacket[]>(
    `
      SELECT
        id,
        user_id,
        ${schema.hasExpiresAt ? "expires_at," : "NULL AS expires_at,"}
        ${schema.hasRevokedAt ? "revoked_at," : "NULL AS revoked_at,"}
        ${schema.hasStatus ? "status" : "NULL AS status"}
      FROM user_sessions
      WHERE ${schema.tokenColumn} = ?
      LIMIT 1
    `,
    [persistedToken],
  );

  const row = rows[0] ?? null;

  if (!row) {
    return {
      found: false,
      sessionId: null,
      userId: null,
      expired: false,
      revoked: false,
      status: null,
      expiresAt: null,
    } satisfies SessionDiagnostics;
  }

  const expiresAtValue = row.expires_at ?? null;
  const expiresAt =
    expiresAtValue == null ? null : new Date(String(expiresAtValue));
  const hasValidExpiresAt =
    expiresAt instanceof Date && !Number.isNaN(expiresAt.getTime());
  const sessionExpired = hasValidExpiresAt
    ? expiresAt.getTime() <= Date.now()
    : false;

  return {
    found: true,
    sessionId: Number(row.id ?? 0) || null,
    userId: Number(row.user_id ?? 0) || null,
    expired: sessionExpired,
    revoked: Boolean(row.revoked_at),
    status: row.status ? String(row.status) : null,
    expiresAt: row.expires_at ?? null,
  } satisfies SessionDiagnostics;
}
