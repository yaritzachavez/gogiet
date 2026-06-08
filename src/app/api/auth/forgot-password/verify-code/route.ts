import type { PoolConnection, RowDataPacket } from "mysql2/promise";
import { NextResponse } from "next/server";

import { legacyErrorResponse } from "@/lib/api-error";
import pool from "@/lib/db";
import { handleCorsPreflight, withCors } from "@/lib/server/cors";

type UserRow = RowDataPacket & {
  id: number;
  verification_code?: string | null;
  verification_expires_at?: Date | string | null;
};

type UserColumnRow = RowDataPacket & {
  Field?: string;
};

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
    String(value ?? "")
      .trim()
      .toLowerCase(),
  );
}

async function getUserColumns(connection: PoolConnection) {
  const [rows] = await connection.query<UserColumnRow[]>(
    "SHOW COLUMNS FROM users",
  );
  return new Set(
    rows.map((row) => String(row.Field ?? "").trim()).filter(Boolean),
  );
}

export function OPTIONS(req: Request) {
  return handleCorsPreflight(req);
}

export async function POST(req: Request) {
  const json = (body: unknown, init?: ResponseInit) =>
    withCors(req, NextResponse.json(body, init));

  try {
    const body = (await req.json()) as { email?: string; code?: string };
    const email = String(body.email ?? "")
      .trim()
      .toLowerCase();
    const code = String(body.code ?? "").trim();

    if (!email || !isValidEmail(email)) {
      return json(
        { success: false, error: "Ingresa un correo válido." },
        { status: 400 },
      );
    }

    if (!/^\d{6}$/.test(code)) {
      return json(
        { success: false, error: "Ingresa un código válido." },
        { status: 400 },
      );
    }

    const connection = await pool.getConnection();

    try {
      const userColumns = await getUserColumns(connection);

      const [rows] = await connection.query<UserRow[]>(
        `
          SELECT id, verification_code
          ${userColumns.has("verification_expires_at") ? ", verification_expires_at" : ""}
          FROM users
          WHERE LOWER(TRIM(email)) = ?
          LIMIT 1
        `,
        [email],
      );

      const user = rows[0];

      if (!user || String(user.verification_code ?? "").trim() !== code) {
        return json(
          { success: false, error: "El código no es correcto." },
          { status: 400 },
        );
      }

      if (
        userColumns.has("verification_expires_at") &&
        user.verification_expires_at
      ) {
        const expiresAt = new Date(user.verification_expires_at).getTime();
        if (!Number.isFinite(expiresAt) || expiresAt < Date.now()) {
          return json(
            { success: false, error: "El código ya expiró." },
            { status: 400 },
          );
        }
      }

      return json({
        success: true,
        message: "Código verificado correctamente.",
      });
    } finally {
      connection.release();
    }
  } catch (error) {
    return withCors(
      req,
      legacyErrorResponse(req, {
        event: "auth.verify_reset_code_error",
        error,
        message: "No pudimos verificar el código.",
        body: { success: false },
      }),
    );
  }
}
