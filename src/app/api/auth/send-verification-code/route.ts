import bcrypt from "bcrypt";
import type { PoolConnection, ResultSetHeader, RowDataPacket } from "mysql2/promise";
import { NextResponse } from "next/server";
import { Resend } from "resend";

import pool from "@/lib/db";

export const runtime = "nodejs";

type ExistingUserRow = RowDataPacket & {
  id: number;
  email_verified?: number | boolean | null;
};

type StatusRow = RowDataPacket & {
  id: number;
};

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

function generateCode() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

async function getUserColumns(connection: PoolConnection) {
  const [rows] = await connection.query<UserColumnRow[]>("SHOW COLUMNS FROM users");
  return new Set(rows.map((row) => String(row.Field ?? "").trim()).filter(Boolean));
}

async function getActiveStatusId(connection: PoolConnection) {
  const [rows] = await connection.query<StatusRow[]>(
    `
      SELECT id
      FROM status_catalog
      WHERE LOWER(TRIM(name)) IN ('active', 'activo', 'pending', 'pendiente')
      ORDER BY CASE
        WHEN LOWER(TRIM(name)) IN ('active', 'activo') THEN 0
        ELSE 1
      END, id ASC
      LIMIT 1
    `,
  );

  return Number(rows[0]?.id ?? 1) || 1;
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      email?: string;
      firstName?: string;
      lastName?: string;
      phone?: string;
    };

    const cleanEmail = String(body.email || "").trim().toLowerCase();
    const firstName = String(body.firstName || "").trim();
    const lastName = String(body.lastName || "").trim();
    const phone = String(body.phone || "").trim() || null;

    if (!cleanEmail) {
      return NextResponse.json(
        { success: false, error: "Correo requerido." },
        { status: 400 },
      );
    }

    if (!isValidEmail(cleanEmail)) {
      return NextResponse.json(
        { success: false, error: "Correo inválido." },
        { status: 400 },
      );
    }

    const resendApiKey = process.env.RESEND_API_KEY?.trim();
    if (!resendApiKey) {
      console.error("[send-verification-code] Falta RESEND_API_KEY", {
        hasEmailFrom: Boolean(process.env.EMAIL_FROM?.trim()),
        environment: process.env.NODE_ENV ?? "development",
      });

      return NextResponse.json(
        {
          success: false,
          error: "No se pudo enviar el código de verificación.",
        },
        { status: 500 },
      );
    }

    const resend = new Resend(resendApiKey);
    const connection = await pool.getConnection();

    try {
      const userColumns = await getUserColumns(connection);
      const passwordColumn = userColumns.has("password_hash")
        ? "password_hash"
        : userColumns.has("password")
          ? "password"
          : "password_hash";
      const activeStatusId = userColumns.has("status_id")
        ? await getActiveStatusId(connection)
        : null;

      const [existingUsers] = await connection.query<ExistingUserRow[]>(
        `
          SELECT id, email_verified
          FROM users
          WHERE LOWER(TRIM(email)) = ?
          LIMIT 1
        `,
        [cleanEmail],
      );

      const existingUser = existingUsers[0] ?? null;

      if (existingUser && Boolean(existingUser.email_verified)) {
        return NextResponse.json(
          {
            success: false,
            error: "Este correo ya está registrado.",
          },
          { status: 409 },
        );
      }

      const code = generateCode();

      await connection.beginTransaction();

      if (existingUser) {
        const updateAssignments: string[] = [
          "verification_code = ?",
        ];
        const updateValues: Array<string | number | boolean | null> = [code];

        if (userColumns.has("email_verified")) {
          updateAssignments.push("email_verified = ?");
          updateValues.push(false);
        }

        if (userColumns.has("verification_expires_at")) {
          updateAssignments.push("verification_expires_at = DATE_ADD(NOW(), INTERVAL 10 MINUTE)");
        }

        if (userColumns.has("first_name") && firstName) {
          updateAssignments.push("first_name = ?");
          updateValues.push(firstName);
        }

        if (userColumns.has("last_name") && lastName) {
          updateAssignments.push("last_name = ?");
          updateValues.push(lastName);
        }

        if (userColumns.has("phone") && phone) {
          updateAssignments.push("phone = ?");
          updateValues.push(phone);
        }

        if (userColumns.has("updated_at")) {
          updateAssignments.push("updated_at = NOW()");
        }

        updateValues.push(existingUser.id);

        await connection.query<ResultSetHeader>(
          `
            UPDATE users
            SET ${updateAssignments.join(", ")}
            WHERE id = ?
          `,
          updateValues,
        );
      } else {
        const configuredSaltRounds = Number(process.env.SALT_ROUNDS ?? 12);
        const saltRounds =
          Number.isFinite(configuredSaltRounds) && configuredSaltRounds > 0
            ? configuredSaltRounds
            : 12;
        const pepper = process.env.PASSWORD_PEPPER ?? "";
        const temporaryPasswordHash = await bcrypt.hash(
          `${cleanEmail}:${Date.now()}:${pepper || "gogi-temp"}`,
          saltRounds,
        );

        const insertColumns = ["email"];
        const insertValues: Array<string | number | boolean | Date | null> = [
          cleanEmail,
        ];
        const placeholders = ["?"];

        if (userColumns.has("first_name")) {
          insertColumns.push("first_name");
          insertValues.push(firstName);
          placeholders.push("?");
        }

        if (userColumns.has("last_name")) {
          insertColumns.push("last_name");
          insertValues.push(lastName);
          placeholders.push("?");
        }

        if (userColumns.has("phone")) {
          insertColumns.push("phone");
          insertValues.push(phone);
          placeholders.push("?");
        }

        if (userColumns.has(passwordColumn)) {
          insertColumns.push(passwordColumn);
          insertValues.push(temporaryPasswordHash);
          placeholders.push("?");
        }

        if (userColumns.has("email_verified")) {
          insertColumns.push("email_verified");
          insertValues.push(false);
          placeholders.push("?");
        }

        if (userColumns.has("verification_code")) {
          insertColumns.push("verification_code");
          insertValues.push(code);
          placeholders.push("?");
        }

        if (userColumns.has("verification_expires_at")) {
          insertColumns.push("verification_expires_at");
          insertValues.push(new Date(Date.now() + 10 * 60 * 1000));
          placeholders.push("?");
        }

        if (userColumns.has("status_id")) {
          insertColumns.push("status_id");
          insertValues.push(activeStatusId);
          placeholders.push("?");
        }

        await connection.query<ResultSetHeader>(
          `
            INSERT INTO users (${insertColumns.join(", ")})
            VALUES (${placeholders.join(", ")})
          `,
          insertValues,
        );
      }

      await connection.commit();

      const resendResponse = await resend.emails.send({
        from: process.env.EMAIL_FROM!,
        to: cleanEmail,
        subject: "Código de verificación - Gogi Eats",
        html: `
          <div style="font-family: Arial, sans-serif; background:#f7f7f7; padding:24px;">
            <div style="max-width:480px; margin:auto; background:#ffffff; border-radius:16px; padding:24px;">
              <h2 style="color:#111;">Verifica tu correo</h2>
              <p style="color:#444;">Usa este código para confirmar tu cuenta en Gogi Eats:</p>
              <div style="font-size:32px; font-weight:bold; letter-spacing:6px; color:#ff6b00; margin:24px 0;">
                ${code}
              </div>
              <p style="color:#666;">Este código expira en 10 minutos.</p>
              <p style="color:#999; font-size:12px;">Si tú no solicitaste este código, ignora este mensaje.</p>
            </div>
          </div>
        `,
      });

      if (resendResponse.error) {
        console.error("[send-verification-code] Resend rechazó el envío", {
          code: (resendResponse.error as SqlLikeError).code ?? null,
          errno: (resendResponse.error as SqlLikeError).errno ?? null,
          sqlMessage: (resendResponse.error as SqlLikeError).sqlMessage ?? null,
          message: resendResponse.error.message,
        });

        return NextResponse.json(
          {
            success: false,
            error: "No se pudo enviar el código de verificación.",
          },
          { status: 500 },
        );
      }

      return NextResponse.json({
        success: true,
      });
    } finally {
      connection.release();
    }
  } catch (error) {
    const sqlError =
      typeof error === "object" && error !== null
        ? (error as SqlLikeError)
        : null;

    console.error("SEND VERIFICATION CODE ERROR:", {
      code: sqlError?.code ?? null,
      errno: sqlError?.errno ?? null,
      sqlMessage: sqlError?.sqlMessage ?? null,
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : sqlError?.stack,
    });

    return NextResponse.json(
      {
        success: false,
        error: "No se pudo enviar el código de verificación.",
      },
      { status: 500 },
    );
  }
}
