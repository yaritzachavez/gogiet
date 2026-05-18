import { createHash, randomBytes } from "node:crypto";

import bcrypt from "bcrypt";
import type {
  PoolConnection,
  ResultSetHeader,
  RowDataPacket,
} from "mysql2/promise";

import {
  getPersistedSessionTokenValue,
  getUserSessionsSchema,
} from "@/lib/admin-security";
import {
  isValidEmail,
  normalizeEmail,
  normalizePhone,
  validatePasswordStrength,
} from "@/lib/auth-account-shared";
import pool from "@/lib/db";
import { logger } from "@/lib/logger";
import { RuntimeSchemaError } from "@/lib/runtime-schema";

type ColumnRow = RowDataPacket & {
  Field?: string;
};

type RateLimitRow = RowDataPacket & {
  id: number;
  attempts: number;
  window_started_at: Date | string | null;
  blocked_until: Date | string | null;
};

type RoleRow = RowDataPacket & {
  id: number;
  name: string;
};

type PasswordResetTokenRow = RowDataPacket & {
  id: number;
  user_id: number;
  email: string;
  token_hash: string;
  expires_at: Date | string;
  used_at: Date | string | null;
};

type UserLoginSecurityRow = {
  id: number;
  email: string;
  email_verified?: number | boolean | null;
  login_attempts?: number | null;
  locked_until?: Date | string | null;
  verification_code?: string | null;
  verification_expires_at?: Date | string | null;
  verification_sent_at?: Date | string | null;
};

type AuditMetadata = Record<string, unknown> | null | undefined;

const DEFAULT_LOCK_THRESHOLD = 5;
const DEFAULT_LOCK_MINUTES = 15;

let ensuredAuthTables = false;
let loggedAuthSchemaCheck = false;

type AuthSchemaState = {
  databaseName: string | null;
  hasPasswordResetTokens: boolean;
  hasAuthRateLimits: boolean;
  hasAuthAuditLogs: boolean;
  hasEmailVerified: boolean;
  hasVerificationCode: boolean;
  hasVerificationExpiresAt: boolean;
  hasVerificationSentAt: boolean;
  hasLoginAttempts: boolean;
  hasLockedUntil: boolean;
};

export type PasswordResetTokenValidation =
  | {
      ok: true;
      tokenRow: PasswordResetTokenRow;
    }
  | {
      ok: false;
      message: string;
      status: number;
    };

function toDate(value: Date | string | null | undefined) {
  if (!value) {
    return null;
  }

  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed : null;
}

export function sanitizeText(value: string, maxLength = 120) {
  return String(value ?? "")
    .replace(/[<>]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

export function sanitizeName(value: string, maxLength = 80) {
  return sanitizeText(value, maxLength).replace(/[^\p{L}\p{N}\s'.-]/gu, "");
}

export function maskEmailForLogs(email: string) {
  const normalized = normalizeEmail(email);
  const [localPart, domain] = normalized.split("@");

  if (!localPart || !domain) {
    return "[invalid-email]";
  }

  return `${localPart.slice(0, 2)}***@${domain}`;
}

export function getRequestIp(req: Request) {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip")?.trim() ||
    "unknown"
  );
}

export function getRequestUserAgent(req: Request) {
  return sanitizeText(req.headers.get("user-agent") ?? "", 255) || "unknown";
}

export function generateSixDigitCode() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

export function generateSecureToken() {
  return randomBytes(32).toString("hex");
}

export function hashOpaqueToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export async function hashPassword(password: string) {
  const configuredSaltRounds = Number(process.env.SALT_ROUNDS ?? 12);
  const saltRounds =
    Number.isFinite(configuredSaltRounds) && configuredSaltRounds > 0
      ? configuredSaltRounds
      : 12;
  const pepper = process.env.PASSWORD_PEPPER ?? "";
  return bcrypt.hash(password + pepper, saltRounds);
}

export async function comparePassword(candidate: string, passwordHash: string) {
  const pepper = process.env.PASSWORD_PEPPER ?? "";
  return bcrypt.compare(candidate + pepper, passwordHash);
}

export async function getUserColumns(connection?: PoolConnection) {
  const executor = connection ?? pool;
  const [rows] = await executor.query<ColumnRow[]>("SHOW COLUMNS FROM users");
  return new Set(
    rows.map((row) => String(row.Field ?? "").trim()).filter(Boolean),
  );
}

async function getAuthSchemaState(connection?: PoolConnection) {
  const executor = connection ?? pool;
  const [databaseRows] = await executor.query<RowDataPacket[]>(
    "SELECT DATABASE() AS db_name",
  );
  const databaseName =
    typeof databaseRows[0]?.db_name === "string"
      ? databaseRows[0].db_name
      : null;

  const tableChecks = await Promise.all(
    ["password_reset_tokens", "auth_rate_limits", "auth_audit_logs"].map(
      async (tableName) => {
        const [rows] = await executor.query<RowDataPacket[]>(
          "SHOW TABLES LIKE ?",
          [tableName],
        );

        return [tableName, rows.length > 0] as const;
      },
    ),
  );

  const userColumns = await getUserColumns(connection);

  return {
    databaseName,
    hasPasswordResetTokens:
      tableChecks.find(
        ([tableName]) => tableName === "password_reset_tokens",
      )?.[1] ?? false,
    hasAuthRateLimits:
      tableChecks.find(
        ([tableName]) => tableName === "auth_rate_limits",
      )?.[1] ?? false,
    hasAuthAuditLogs:
      tableChecks.find(([tableName]) => tableName === "auth_audit_logs")?.[1] ??
      false,
    hasEmailVerified: userColumns.has("email_verified"),
    hasVerificationCode: userColumns.has("verification_code"),
    hasVerificationExpiresAt: userColumns.has("verification_expires_at"),
    hasVerificationSentAt: userColumns.has("verification_sent_at"),
    hasLoginAttempts: userColumns.has("login_attempts"),
    hasLockedUntil: userColumns.has("locked_until"),
  } satisfies AuthSchemaState;
}

export async function ensureAuthSecuritySchema(connection?: PoolConnection) {
  if (ensuredAuthTables && !connection) {
    return;
  }

  const conn = connection ?? (await pool.getConnection());

  try {
    const schemaState = await getAuthSchemaState(conn);

    if (!loggedAuthSchemaCheck) {
      logger.warn(
        "auth.schema_runtime_check",
        "[auth-schema] verificación runtime de auth",
        schemaState,
      );
      loggedAuthSchemaCheck = true;
    }

    const missingTables = [
      !schemaState.hasPasswordResetTokens ? "password_reset_tokens" : null,
      !schemaState.hasAuthRateLimits ? "auth_rate_limits" : null,
      !schemaState.hasAuthAuditLogs ? "auth_audit_logs" : null,
    ].filter(Boolean) as string[];

    if (missingTables.length > 0) {
      throw new RuntimeSchemaError(
        `Falta tabla requerida en runtime: ${missingTables.join(", ")}. Ejecuta migraciones con prisma migrate deploy antes de atender tráfico.`,
      );
    }

    const missingUserColumns = [
      !schemaState.hasEmailVerified ? "email_verified" : null,
      !schemaState.hasVerificationCode ? "verification_code" : null,
      !schemaState.hasVerificationExpiresAt ? "verification_expires_at" : null,
      !schemaState.hasVerificationSentAt ? "verification_sent_at" : null,
      !schemaState.hasLoginAttempts ? "login_attempts" : null,
      !schemaState.hasLockedUntil ? "locked_until" : null,
    ].filter(Boolean) as string[];

    if (missingUserColumns.length > 0) {
      logger.warn(
        "auth.schema_users_columns_missing",
        "[auth-schema] faltan columnas auxiliares en users",
        {
          databaseName: schemaState.databaseName,
          missingUserColumns,
        },
      );
    }

    ensuredAuthTables = true;
  } finally {
    if (!connection) {
      conn.release();
    }
  }
}

export async function recordAuthAuditLog(params: {
  userId?: number | null;
  action: string;
  email?: string | null;
  ip?: string | null;
  userAgent?: string | null;
  metadata?: AuditMetadata;
}) {
  try {
    await ensureAuthSecuritySchema();
  } catch (error) {
    if (error instanceof RuntimeSchemaError) {
      return;
    }
    throw error;
  }

  await pool.query<ResultSetHeader>(
    `
      INSERT INTO auth_audit_logs (
        user_id,
        action,
        email,
        ip,
        user_agent,
        metadata
      )
      VALUES (?, ?, ?, ?, ?, ?)
    `,
    [
      params.userId ?? null,
      params.action,
      params.email ? normalizeEmail(params.email) : null,
      params.ip ?? null,
      params.userAgent ?? null,
      params.metadata ? JSON.stringify(params.metadata) : null,
    ],
  );
}

export async function consumeRateLimit(params: {
  action: string;
  identifier: string;
  limit: number;
  windowSeconds: number;
  blockSeconds?: number;
}) {
  try {
    await ensureAuthSecuritySchema();
  } catch (error) {
    if (error instanceof RuntimeSchemaError) {
      return { allowed: true as const, retryAfterSeconds: 0 };
    }
    throw error;
  }

  const identifier = sanitizeText(params.identifier, 191);
  const blockSeconds = params.blockSeconds ?? params.windowSeconds;

  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const [rows] = await connection.query<RateLimitRow[]>(
      `
        SELECT id, attempts, window_started_at, blocked_until
        FROM auth_rate_limits
        WHERE action_type = ? AND identifier = ?
        LIMIT 1
        FOR UPDATE
      `,
      [params.action, identifier],
    );

    const existing = rows[0] ?? null;
    const now = Date.now();

    if (!existing) {
      await connection.query<ResultSetHeader>(
        `
          INSERT INTO auth_rate_limits (
            action_type,
            identifier,
            attempts,
            window_started_at,
            blocked_until
          )
          VALUES (?, ?, 1, NOW(), NULL)
        `,
        [params.action, identifier],
      );

      await connection.commit();
      return { allowed: true as const, retryAfterSeconds: 0 };
    }

    const blockedUntil = toDate(existing.blocked_until);
    if (blockedUntil && blockedUntil.getTime() > now) {
      await connection.commit();
      return {
        allowed: false as const,
        retryAfterSeconds: Math.max(
          1,
          Math.ceil((blockedUntil.getTime() - now) / 1000),
        ),
      };
    }

    const windowStartedAt = toDate(existing.window_started_at);
    const windowExpired =
      !windowStartedAt ||
      now - windowStartedAt.getTime() > params.windowSeconds * 1000;
    const nextAttempts = windowExpired ? 1 : Number(existing.attempts ?? 0) + 1;

    const shouldBlock = nextAttempts > params.limit;

    await connection.query<ResultSetHeader>(
      `
        UPDATE auth_rate_limits
        SET
          attempts = ?,
          window_started_at = ${windowExpired ? "NOW()" : "window_started_at"},
          blocked_until = ${shouldBlock ? "DATE_ADD(NOW(), INTERVAL ? SECOND)" : "NULL"}
        WHERE id = ?
      `,
      shouldBlock
        ? [nextAttempts, blockSeconds, existing.id]
        : [nextAttempts, existing.id],
    );

    await connection.commit();

    if (shouldBlock) {
      return {
        allowed: false as const,
        retryAfterSeconds: blockSeconds,
      };
    }

    return { allowed: true as const, retryAfterSeconds: 0 };
  } catch (error) {
    try {
      await connection.rollback();
    } catch {}
    throw error;
  } finally {
    connection.release();
  }
}

export async function getRolesForUser(userId: number) {
  const [rows] = await pool.query<RoleRow[]>(
    `
      SELECT r.id, r.name
      FROM user_roles ur
      INNER JOIN roles r ON r.id = ur.role_id
      WHERE ur.user_id = ?
      ORDER BY r.id ASC
    `,
    [userId],
  );

  return rows;
}

export async function ensureRoleByName(roleName: string) {
  const normalizedRole = sanitizeText(roleName, 80).toLowerCase();
  const [rows] = await pool.query<RoleRow[]>(
    `
      SELECT id, name
      FROM roles
      WHERE LOWER(TRIM(name)) = ?
      LIMIT 1
    `,
    [normalizedRole],
  );

  if (rows[0]) {
    return rows[0];
  }

  const [insertResult] = await pool.query<ResultSetHeader>(
    `
      INSERT INTO roles (name)
      VALUES (?)
    `,
    [normalizedRole],
  );

  return {
    id: Number(insertResult.insertId),
    name: normalizedRole,
  };
}

export async function assignRoleToUser(userId: number, roleName: string) {
  const role = await ensureRoleByName(roleName);

  await pool.query<ResultSetHeader>(
    `
      INSERT IGNORE INTO user_roles (user_id, role_id)
      VALUES (?, ?)
    `,
    [userId, role.id],
  );

  return role;
}

export async function registerFailedLoginAttempt(userId: number) {
  await ensureAuthSecuritySchema();
  const schemaState = await getAuthSchemaState();

  if (!schemaState.hasLoginAttempts || !schemaState.hasLockedUntil) {
    logger.warn(
      "auth.login_attempt_tracking_unavailable",
      "[auth-schema] tracking de intentos no disponible",
      {
        databaseName: schemaState.databaseName,
        hasLoginAttempts: schemaState.hasLoginAttempts,
        hasLockedUntil: schemaState.hasLockedUntil,
        userId,
      },
    );
    return;
  }

  await pool.query<ResultSetHeader>(
    `
      UPDATE users
      SET
        login_attempts = COALESCE(login_attempts, 0) + 1,
        locked_until = CASE
          WHEN COALESCE(login_attempts, 0) + 1 >= ? THEN DATE_ADD(NOW(), INTERVAL ? MINUTE)
          ELSE locked_until
        END,
        updated_at = NOW()
      WHERE id = ?
    `,
    [DEFAULT_LOCK_THRESHOLD, DEFAULT_LOCK_MINUTES, userId],
  );
}

export async function clearFailedLoginAttempts(userId: number) {
  await ensureAuthSecuritySchema();
  const schemaState = await getAuthSchemaState();

  if (!schemaState.hasLoginAttempts || !schemaState.hasLockedUntil) {
    logger.warn(
      "auth.login_attempt_clear_unavailable",
      "[auth-schema] limpieza de intentos no disponible",
      {
        databaseName: schemaState.databaseName,
        hasLoginAttempts: schemaState.hasLoginAttempts,
        hasLockedUntil: schemaState.hasLockedUntil,
        userId,
      },
    );
    return;
  }

  await pool.query<ResultSetHeader>(
    `
      UPDATE users
      SET
        login_attempts = 0,
        locked_until = NULL,
        updated_at = NOW()
      WHERE id = ?
    `,
    [userId],
  );
}

export function isUserLocked(user: UserLoginSecurityRow) {
  const lockedUntil = toDate(user.locked_until);

  if (!lockedUntil) {
    return false;
  }

  return lockedUntil.getTime() > Date.now();
}

export async function invalidateUserSessions(userId: number) {
  const schema = await getUserSessionsSchema();
  const updates = ["status = 'revoked'"];

  if (schema.hasRevokedAt) {
    updates.push("revoked_at = COALESCE(revoked_at, NOW())");
  }

  if (schema.hasUpdatedAt) {
    updates.push("updated_at = NOW()");
  }

  const where = ["user_id = ?"];

  if (schema.hasStatus) {
    where.push("status = 'active'");
  }

  if (schema.hasExpiresAt) {
    where.push("expires_at > NOW()");
  }

  await pool.query<ResultSetHeader>(
    `
      UPDATE user_sessions
      SET ${updates.join(", ")}
      WHERE ${where.join(" AND ")}
    `,
    [userId],
  );
}

export async function isSessionTokenActive(token: string) {
  const schema = await getUserSessionsSchema();
  const persistedToken = getPersistedSessionTokenValue(token, schema);
  const where = [`${schema.tokenColumn} = ?`];

  if (schema.hasStatus) {
    where.push("status = 'active'");
  }

  if (schema.hasRevokedAt) {
    where.push("revoked_at IS NULL");
  }

  if (schema.hasExpiresAt) {
    where.push("expires_at > NOW()");
  }

  const [rows] = await pool.query<RowDataPacket[]>(
    `
      SELECT id
      FROM user_sessions
      WHERE ${where.join(" AND ")}
      LIMIT 1
    `,
    [persistedToken],
  );

  return rows.length > 0;
}

export async function touchSessionToken(token: string) {
  const schema = await getUserSessionsSchema();
  const persistedToken = getPersistedSessionTokenValue(token, schema);
  const updates: string[] = [];

  if (schema.hasLastActiveAt) {
    updates.push("last_active_at = NOW()");
  }

  if (schema.hasUpdatedAt) {
    updates.push("updated_at = NOW()");
  }

  if (updates.length === 0) {
    return;
  }

  const where = [`${schema.tokenColumn} = ?`];

  if (schema.hasStatus) {
    where.push("status = 'active'");
  }

  if (schema.hasRevokedAt) {
    where.push("revoked_at IS NULL");
  }

  if (schema.hasExpiresAt) {
    where.push("expires_at > NOW()");
  }

  await pool.query<ResultSetHeader>(
    `
      UPDATE user_sessions
      SET ${updates.join(", ")}
      WHERE ${where.join(" AND ")}
    `,
    [persistedToken],
  );
}

export async function createPasswordResetToken(params: {
  userId: number;
  email: string;
  ip?: string | null;
  userAgent?: string | null;
  expiresInMinutes?: number;
}) {
  await ensureAuthSecuritySchema();

  const token = generateSecureToken();
  const tokenHash = hashOpaqueToken(token);
  const expiresInMinutes = params.expiresInMinutes ?? 30;

  await pool.query<ResultSetHeader>(
    `
      INSERT INTO password_reset_tokens (
        user_id,
        email,
        token_hash,
        expires_at,
        requested_ip,
        user_agent
      )
      VALUES (?, ?, ?, DATE_ADD(NOW(), INTERVAL ? MINUTE), ?, ?)
    `,
    [
      params.userId,
      normalizeEmail(params.email),
      tokenHash,
      expiresInMinutes,
      params.ip ?? null,
      params.userAgent ?? null,
    ],
  );

  return token;
}

export async function validatePasswordResetToken(token: string) {
  await ensureAuthSecuritySchema();

  const tokenHash = hashOpaqueToken(token);
  const [rows] = await pool.query<PasswordResetTokenRow[]>(
    `
      SELECT id, user_id, email, token_hash, expires_at, used_at
      FROM password_reset_tokens
      WHERE token_hash = ?
      LIMIT 1
    `,
    [tokenHash],
  );

  const tokenRow = rows[0];

  if (!tokenRow) {
    return {
      ok: false as const,
      status: 400,
      message: "El enlace de recuperación no es válido.",
    };
  }

  if (tokenRow.used_at) {
    return {
      ok: false as const,
      status: 400,
      message: "Este enlace ya fue utilizado.",
    };
  }

  const expiresAt = toDate(tokenRow.expires_at);
  if (!expiresAt || expiresAt.getTime() < Date.now()) {
    return {
      ok: false as const,
      status: 400,
      message: "El enlace de recuperación ya expiró.",
    };
  }

  return {
    ok: true as const,
    tokenRow,
  };
}

export async function markPasswordResetTokenUsed(tokenId: number) {
  await pool.query<ResultSetHeader>(
    `
      UPDATE password_reset_tokens
      SET used_at = NOW(), updated_at = NOW()
      WHERE id = ?
    `,
    [tokenId],
  );
}

export function isVerifiedFlag(value: number | boolean | null | undefined) {
  return value === true || value === 1;
}

export function getAuthCookieConfig() {
  const maxAgeHours = Number(process.env.AUTH_SESSION_HOURS ?? 9);
  const safeHours =
    Number.isFinite(maxAgeHours) && maxAgeHours > 0 ? maxAgeHours : 9;

  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: 60 * 60 * safeHours,
  };
}

export {
  isValidEmail,
  normalizeEmail,
  normalizePhone,
  validatePasswordStrength,
};
