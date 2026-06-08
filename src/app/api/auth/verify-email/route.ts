import type { ResultSetHeader, RowDataPacket } from "mysql2/promise";
import { NextResponse } from "next/server";

import { legacyErrorResponse } from "@/lib/api-error";
import {
  consumeRateLimit,
  ensureAuthSecuritySchema,
  getRequestIp,
  getRequestUserAgent,
  getUserColumns,
  isValidEmail,
  maskEmailForLogs,
  normalizeEmail,
  recordAuthAuditLog,
} from "@/lib/auth-security";
import { getActiveAuthStatusId } from "@/lib/auth-users";
import pool from "@/lib/db";
import { handleCorsPreflight, withCors } from "@/lib/server/cors";

type VerificationRow = RowDataPacket & {
  id: number;
  verification_code?: string | null;
  verification_expires_at?: Date | string | null;
  email_verified?: number | boolean | null;
  status_id?: number | null;
};

export function OPTIONS(req: Request) {
  return handleCorsPreflight(req);
}

export async function POST(req: Request) {
  const json = (body: unknown, init?: ResponseInit) =>
    withCors(req, NextResponse.json(body, init));

  try {
    const body = (await req.json()) as {
      email?: string;
      code?: string;
    };

    const email = normalizeEmail(body.email ?? "");
    const code = String(body.code ?? "").trim();
    const ip = getRequestIp(req);
    const userAgent = getRequestUserAgent(req);

    if (!email || !isValidEmail(email)) {
      return json(
        { success: false, error: "Ingresa un correo válido." },
        { status: 400 },
      );
    }

    if (!/^\d{6}$/.test(code)) {
      return json(
        { success: false, error: "Ingresa un código de verificación válido." },
        { status: 400 },
      );
    }

    const rateLimit = await consumeRateLimit({
      action: "verify_email_code",
      identifier: `${email}:${ip}`,
      limit: 8,
      windowSeconds: 10 * 60,
      blockSeconds: 15 * 60,
    });

    if (!rateLimit.allowed) {
      return json(
        {
          success: false,
          error:
            "Has realizado demasiados intentos. Intenta nuevamente en unos minutos.",
        },
        { status: 429 },
      );
    }

    await ensureAuthSecuritySchema();
    const userColumns = await getUserColumns();
    const activeStatusId = await getActiveAuthStatusId();

    const [rows] = await pool.query<VerificationRow[]>(
      `
        SELECT id, verification_code, verification_expires_at, email_verified, status_id
        FROM users
        WHERE LOWER(TRIM(email)) = ?
        LIMIT 1
      `,
      [email],
    );

    const user = rows[0];

    if (!user) {
      return json(
        { success: false, error: "No se pudo verificar el correo." },
        { status: 400 },
      );
    }

    console.info("[verify-email] usuario encontrado", {
      userId: user.id,
      email: maskEmailForLogs(email),
      statusId: user.status_id ?? null,
      emailVerified: Boolean(user.email_verified),
    });

    if (user.email_verified === true || user.email_verified === 1) {
      return json({
        success: true,
        message: "Tu correo ya estaba verificado.",
      });
    }

    if (String(user.verification_code ?? "").trim() !== code) {
      return json(
        { success: false, error: "El código de verificación no es válido." },
        { status: 400 },
      );
    }

    console.info("[verify-email] código válido", {
      userId: user.id,
      email: maskEmailForLogs(email),
    });

    if (user.verification_expires_at) {
      const expiresAt = new Date(user.verification_expires_at).getTime();
      if (!Number.isFinite(expiresAt) || expiresAt < Date.now()) {
        return json(
          { success: false, error: "El código de verificación ya expiró." },
          { status: 400 },
        );
      }
    }

    const updateFields = [
      "email_verified = 1",
      userColumns.has("email_verified_at")
        ? "email_verified_at = COALESCE(email_verified_at, NOW())"
        : null,
      "status_id = ?",
      userColumns.has("status") ? "status = 'ACTIVE'" : null,
      "verification_code = NULL",
      "verification_expires_at = NULL",
      "verification_sent_at = NULL",
      "updated_at = NOW()",
    ].filter(Boolean);

    await pool.query<ResultSetHeader>(
      `
        UPDATE users
        SET ${updateFields.join(", ")}
        WHERE id = ?
      `,
      [activeStatusId, user.id],
    );

    console.info("[verify-email] emailVerified actualizado", {
      userId: user.id,
      email: maskEmailForLogs(email),
      emailVerified: true,
      emailVerifiedAtUpdated: userColumns.has("email_verified_at"),
    });

    console.info("[verify-email] isActive/status actualizado", {
      userId: user.id,
      email: maskEmailForLogs(email),
      statusId: activeStatusId,
      status: "ACTIVE",
    });

    await recordAuthAuditLog({
      userId: user.id,
      action: "email_verified",
      email,
      ip,
      userAgent,
    });

    return json({
      success: true,
      message: "Correo verificado correctamente.",
    });
  } catch (error) {
    return withCors(
      req,
      legacyErrorResponse(req, {
        event: "auth.verify_email_error",
        error,
        message: "No se pudo verificar el correo.",
        body: { success: false },
      }),
    );
  }
}
