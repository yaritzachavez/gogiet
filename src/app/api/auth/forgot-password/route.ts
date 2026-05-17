import type { PoolConnection, ResultSetHeader, RowDataPacket } from "mysql2/promise";
import { NextResponse } from "next/server";
import { Resend } from "resend";

import pool from "@/lib/db";
import { handleCorsPreflight, withCors } from "@/lib/server/cors";

type UserRow = RowDataPacket & {
  id: number;
  email: string;
  email_verified?: number | boolean | null;
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
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value ?? "").trim().toLowerCase());
}

async function getUserColumns(connection: PoolConnection) {
  const [rows] = await connection.query<UserColumnRow[]>("SHOW COLUMNS FROM users");
  return new Set(rows.map((row) => String(row.Field ?? "").trim()).filter(Boolean));
}

export function OPTIONS(req: Request) {
  return handleCorsPreflight(req);
}

export async function POST(req: Request) {
  const json = (body: unknown, init?: ResponseInit) =>
    withCors(req, NextResponse.json(body, init));

  try {
    const body = (await req.json()) as { email?: string };
    const email = String(body.email ?? "").trim().toLowerCase();

    if (!email) {
      return json({ success: false, error: "Correo requerido." }, { status: 400 });
    }

    if (!isValidEmail(email)) {
      return json({ success: false, error: "Ingresa un correo válido." }, { status: 400 });
    }

    const resendApiKey = process.env.RESEND_API_KEY?.trim();
    const emailFrom = process.env.EMAIL_FROM?.trim();

    if (!resendApiKey || !emailFrom) {
      console.error("FORGOT PASSWORD CONFIG ERROR:", {
        hasResendApiKey: Boolean(resendApiKey),
        hasEmailFrom: Boolean(emailFrom),
      });
      return json(
        { success: false, error: "No pudimos iniciar la recuperación de contraseña." },
        { status: 500 },
      );
    }

    const resend = new Resend(resendApiKey);
    const connection = await pool.getConnection();

    try {
      const userColumns = await getUserColumns(connection);

      if (!userColumns.has("email") || !userColumns.has("verification_code")) {
        return json(
          {
            success: false,
            error: "La base no tiene soporte para recuperación por código.",
          },
          { status: 500 },
        );
      }

      const [rows] = await connection.query<UserRow[]>(
        `
          SELECT id, email
          ${userColumns.has("email_verified") ? ", email_verified" : ""}
          FROM users
          WHERE LOWER(TRIM(email)) = ?
          LIMIT 1
        `,
        [email],
      );

      const user = rows[0];

      if (!user) {
        return json(
          { success: false, error: "No encontramos una cuenta con ese correo." },
          { status: 404 },
        );
      }

      const code = generateCode();

      await connection.beginTransaction();

      const updateAssignments = ["verification_code = ?"];
      const updateValues: Array<string | null> = [code];

      if (userColumns.has("verification_expires_at")) {
        updateAssignments.push("verification_expires_at = DATE_ADD(NOW(), INTERVAL 10 MINUTE)");
      }

      if (userColumns.has("updated_at")) {
        updateAssignments.push("updated_at = NOW()");
      }

      updateValues.push(String(user.id));

      await connection.query<ResultSetHeader>(
        `
          UPDATE users
          SET ${updateAssignments.join(", ")}
          WHERE id = ?
        `,
        updateValues,
      );

      const resendResponse = await resend.emails.send({
        from: emailFrom,
        to: email,
        subject: "Código para recuperar tu contraseña - Gogi Eats",
        html: `
          <div style="font-family: Arial, sans-serif; background:#f7f7f7; padding:24px;">
            <div style="max-width:480px; margin:auto; background:#ffffff; border-radius:16px; padding:24px;">
              <h2 style="color:#111;">Recupera tu contraseña</h2>
              <p style="color:#444;">Usa este código para continuar con el cambio de contraseña en Gogi Eats:</p>
              <div style="font-size:32px; font-weight:bold; letter-spacing:6px; color:#ff6b00; margin:24px 0;">
                ${code}
              </div>
              <p style="color:#666;">Este código expira en 10 minutos.</p>
              <p style="color:#999; font-size:12px;">Si no solicitaste este cambio, ignora este mensaje.</p>
            </div>
          </div>
        `,
      });

      if (resendResponse.error) {
        await connection.rollback();
        console.error("FORGOT PASSWORD RESEND ERROR:", {
          code: (resendResponse.error as SqlLikeError).code ?? null,
          errno: (resendResponse.error as SqlLikeError).errno ?? null,
          sqlMessage: (resendResponse.error as SqlLikeError).sqlMessage ?? null,
          message: resendResponse.error.message,
        });

        return json(
          { success: false, error: "No pudimos enviar el código por correo." },
          { status: 500 },
        );
      }

      await connection.commit();

      return json({
        success: true,
        message: "Te enviamos un código de verificación para recuperar tu contraseña.",
      });
    } catch (error) {
      try {
        await connection.rollback();
      } catch {}
      throw error;
    } finally {
      connection.release();
    }
  } catch (error) {
    const sqlError =
      typeof error === "object" && error !== null ? (error as SqlLikeError) : null;

    console.error("FORGOT PASSWORD ERROR:", {
      code: sqlError?.code ?? null,
      errno: sqlError?.errno ?? null,
      sqlMessage: sqlError?.sqlMessage ?? null,
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : sqlError?.stack,
    });

    return json(
      { success: false, error: "No pudimos iniciar la recuperación de contraseña." },
      { status: 500 },
    );
  }
}
