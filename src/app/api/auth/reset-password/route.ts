import type { ResultSetHeader, RowDataPacket } from "mysql2/promise";
import { NextResponse } from "next/server";

import pool from "@/lib/db";
import {
  ensureAuthSecuritySchema,
  hashPassword,
  invalidateUserSessions,
  markPasswordResetTokenUsed,
  recordAuthAuditLog,
  validatePasswordResetToken,
  validatePasswordStrength,
} from "@/lib/auth-security";
import { handleCorsPreflight, withCors } from "@/lib/server/cors";

type UserColumnRow = RowDataPacket & {
  Field?: string;
};

type SqlLikeError = {
  code?: string;
  errno?: number;
  sqlMessage?: string;
  message?: string;
  stack?: string;
};

async function getUserColumns() {
  const [rows] = await pool.query<UserColumnRow[]>("SHOW COLUMNS FROM users");
  return new Set(rows.map((row) => String(row.Field ?? "").trim()).filter(Boolean));
}

export function OPTIONS(req: Request) {
  return handleCorsPreflight(req);
}

export async function POST(req: Request) {
  const json = (body: unknown, init?: ResponseInit) =>
    withCors(req, NextResponse.json(body, init));

  try {
    const body = (await req.json()) as {
      token?: string;
      password?: string;
      confirmPassword?: string;
    };

    const token = String(body.token ?? "").trim();
    const password = String(body.password ?? "");
    const confirmPassword = String(body.confirmPassword ?? "");

    if (!token) {
      return json({ success: false, error: "El enlace de recuperación no es válido." }, { status: 400 });
    }

    const passwordError = validatePasswordStrength(password);
    if (passwordError) {
      return json({ success: false, error: passwordError }, { status: 400 });
    }

    if (password !== confirmPassword) {
      return json({ success: false, error: "Las contraseñas no coinciden." }, { status: 400 });
    }

    await ensureAuthSecuritySchema();

    const validation = await validatePasswordResetToken(token);
    if (!validation.ok) {
      return json({ success: false, error: validation.message }, { status: validation.status });
    }

    const userColumns = await getUserColumns();
    const passwordColumn = userColumns.has("password_hash")
      ? "password_hash"
      : userColumns.has("password")
        ? "password"
        : null;

    if (!passwordColumn) {
      return json(
        { success: false, error: "La base no tiene soporte para actualizar contraseña." },
        { status: 500 },
      );
    }

    const passwordHash = await hashPassword(password);

    await pool.query<ResultSetHeader>(
      `
        UPDATE users
        SET
          \`${passwordColumn}\` = ?,
          verification_code = NULL,
          verification_expires_at = NULL,
          updated_at = NOW()
        WHERE id = ?
      `,
      [passwordHash, validation.tokenRow.user_id],
    );

    await markPasswordResetTokenUsed(validation.tokenRow.id);
    await invalidateUserSessions(validation.tokenRow.user_id);
    await recordAuthAuditLog({
      userId: validation.tokenRow.user_id,
      action: "password_reset_completed",
      email: validation.tokenRow.email,
      metadata: { tokenId: validation.tokenRow.id },
    });

    return json({
      success: true,
      message: "Tu contraseña fue actualizada correctamente.",
    });
  } catch (error) {
    const sqlError =
      typeof error === "object" && error !== null ? (error as SqlLikeError) : null;

    console.error("RESET PASSWORD ERROR:", {
      code: sqlError?.code ?? null,
      errno: sqlError?.errno ?? null,
      sqlMessage: sqlError?.sqlMessage ?? null,
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : sqlError?.stack,
    });

    return json(
      { success: false, error: "No pudimos actualizar tu contraseña." },
      { status: 500 },
    );
  }
}
