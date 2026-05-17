import type { ResultSetHeader, RowDataPacket } from "mysql2/promise";
import { NextResponse } from "next/server";

import pool from "@/lib/db";
import {
  assignRoleToUser,
  consumeRateLimit,
  ensureAuthSecuritySchema,
  getRequestIp,
  getRequestUserAgent,
  hashPassword,
  isValidEmail,
  normalizeEmail,
  normalizePhone,
  recordAuthAuditLog,
  sanitizeName,
  validatePasswordStrength,
} from "@/lib/auth-security";
import { getActiveAuthStatusId } from "@/lib/auth-users";
import { mapPublicRoleToDbRole } from "@/lib/role-utils";
import { handleCorsPreflight, withCors } from "@/lib/server/cors";

type RegisterBody = {
  firstName?: string;
  lastName?: string;
  name?: string;
  email?: string;
  phone?: string;
  password?: string;
  confirmPassword?: string;
  verificationCode?: string;
};

type UserRow = RowDataPacket & {
  id: number;
  email_verified?: number | boolean | null;
  verification_code?: string | null;
  verification_expires_at?: Date | string | null;
};

type SqlLikeError = {
  code?: string;
  errno?: number;
  sqlMessage?: string;
  message?: string;
  stack?: string;
};

export function OPTIONS(req: Request) {
  return handleCorsPreflight(req);
}

export async function POST(req: Request) {
  const json = (body: unknown, init?: ResponseInit) =>
    withCors(req, NextResponse.json(body, init));

  try {
    const body = (await req.json().catch(() => null)) as RegisterBody | null;
    const firstName = sanitizeName(body?.firstName ?? body?.name ?? "");
    const lastName = sanitizeName(body?.lastName ?? "");
    const email = normalizeEmail(body?.email ?? "");
    const phone = normalizePhone(body?.phone ?? "");
    const password = String(body?.password ?? "");
    const confirmPassword = String(body?.confirmPassword ?? "");
    const verificationCode = String(body?.verificationCode ?? "").trim();
    const ip = getRequestIp(req);
    const userAgent = getRequestUserAgent(req);

    const rateLimit = await consumeRateLimit({
      action: "register_attempt",
      identifier: `${ip}:${email || "anonymous"}`,
      limit: 5,
      windowSeconds: 15 * 60,
      blockSeconds: 20 * 60,
    });

    if (!rateLimit.allowed) {
      return json(
        {
          success: false,
          error: "Demasiados intentos de registro. Intenta nuevamente más tarde.",
        },
        { status: 429 },
      );
    }

    if (!firstName || !lastName || !email || !password) {
      return json(
        { success: false, error: "Completa todos los campos obligatorios." },
        { status: 400 },
      );
    }

    if (!isValidEmail(email)) {
      return json(
        { success: false, error: "Ingresa un correo válido." },
        { status: 400 },
      );
    }

    if (!phone || phone.length < 10) {
      return json(
        { success: false, error: "Ingresa un número de teléfono válido." },
        { status: 400 },
      );
    }

    const passwordError = validatePasswordStrength(password);
    if (passwordError) {
      return json({ success: false, error: passwordError }, { status: 400 });
    }

    if (password !== confirmPassword) {
      return json(
        { success: false, error: "Las contraseñas no coinciden." },
        { status: 400 },
      );
    }

    if (!/^\d{6}$/.test(verificationCode)) {
      return json(
        { success: false, error: "Debes ingresar un código de verificación válido." },
        { status: 400 },
      );
    }

    await ensureAuthSecuritySchema();

    const [rows] = await pool.query<UserRow[]>(
      `
        SELECT id, email_verified, verification_code, verification_expires_at
        FROM users
        WHERE LOWER(TRIM(email)) = ?
        LIMIT 1
      `,
      [email],
    );

    const user = rows[0];

    if (!user) {
      return json(
        {
          success: false,
          error: "Primero solicita un código de verificación para continuar.",
        },
        { status: 400 },
      );
    }

    if ((user.email_verified === true || user.email_verified === 1) && !user.verification_code) {
      return json(
        { success: false, error: "Este correo ya está registrado." },
        { status: 409 },
      );
    }

    if (String(user.verification_code ?? "").trim() !== verificationCode) {
      return json(
        { success: false, error: "El código de verificación no es válido." },
        { status: 400 },
      );
    }

    if (user.verification_expires_at) {
      const expiresAt = new Date(user.verification_expires_at).getTime();
      if (!Number.isFinite(expiresAt) || expiresAt < Date.now()) {
        return json(
          { success: false, error: "El código de verificación ya expiró." },
          { status: 400 },
        );
      }
    }

    const passwordHash = await hashPassword(password);
    const activeStatusId = await getActiveAuthStatusId();

    await pool.query<ResultSetHeader>(
      `
        UPDATE users
        SET
          first_name = ?,
          last_name = ?,
          phone = ?,
          password_hash = ?,
          status_id = ?,
          email_verified = 1,
          verification_code = NULL,
          verification_expires_at = NULL,
          verification_sent_at = NULL,
          updated_at = NOW()
        WHERE id = ?
      `,
      [firstName, lastName, phone, passwordHash, activeStatusId, user.id],
    );

    const defaultRoleName = mapPublicRoleToDbRole("CLIENTE");
    const role = await assignRoleToUser(user.id, defaultRoleName);

    await recordAuthAuditLog({
      userId: user.id,
      action: "register_completed",
      email,
      ip,
      userAgent,
      metadata: { role: role.name },
    });

    return json(
      {
        success: true,
        message: "Usuario creado correctamente.",
        requiresVerification: false,
        email,
      },
      { status: 201 },
    );
  } catch (error) {
    const sqlError =
      typeof error === "object" && error !== null ? (error as SqlLikeError) : null;

    console.error("REGISTER ERROR:", {
      code: sqlError?.code ?? null,
      errno: sqlError?.errno ?? null,
      sqlMessage: sqlError?.sqlMessage ?? null,
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : sqlError?.stack,
    });

    if (sqlError?.code === "ER_DUP_ENTRY") {
      return json(
        { success: false, error: "Ya existe una cuenta con esos datos." },
        { status: 409 },
      );
    }

    return json(
      {
        success: false,
        error: "Ocurrió un problema en el servidor. Intenta nuevamente.",
      },
      { status: 500 },
    );
  }
}
