import type {
  PoolConnection,
  ResultSetHeader,
  RowDataPacket,
} from "mysql2/promise";
import { NextResponse } from "next/server";
import { Resend } from "resend";

import { legacyErrorResponse } from "@/lib/api-error";

import {
  consumeRateLimit,
  ensureAuthSecuritySchema,
  generateSixDigitCode,
  getRequestIp,
  getRequestUserAgent,
  hashPassword,
  isValidEmail,
  maskEmailForLogs,
  normalizeEmail,
  recordAuthAuditLog,
  sanitizeName,
} from "@/lib/auth-security";
import { getInactiveAuthStatusId } from "@/lib/auth-users";
import pool from "@/lib/db";
import { handleCorsPreflight } from "@/lib/server/cors";

type ExistingUserRow = RowDataPacket & {
  id: number;
  email_verified?: number | boolean | null;
  verification_sent_at?: Date | string | null;
};

type UserColumnRow = RowDataPacket & {
  Field?: string;
};

async function getUserColumns(connection: PoolConnection) {
  const [rows] = await connection.query<UserColumnRow[]>(
    "SHOW COLUMNS FROM users",
  );
  return new Set(
    rows.map((row) => String(row.Field ?? "").trim()).filter(Boolean),
  );
}

export const runtime = "nodejs";

export function OPTIONS(req: Request) {
  return handleCorsPreflight(req);
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      email?: string;
      firstName?: string;
      lastName?: string;
      phone?: string;
    };

    const cleanEmail = normalizeEmail(body.email ?? "");
    const firstName = sanitizeName(body.firstName ?? "");
    const lastName = sanitizeName(body.lastName ?? "");
    const phone =
      String(body.phone ?? "")
        .replace(/[^\d]/g, "")
        .slice(0, 15) || null;
    const ip = getRequestIp(req);
    const userAgent = getRequestUserAgent(req);

    if (!cleanEmail || !isValidEmail(cleanEmail)) {
      return NextResponse.json(
        { success: false, error: "Ingresa un correo válido." },
        { status: 400 },
      );
    }

    const ipRateLimit = await consumeRateLimit({
      action: "send_verification_code_ip",
      identifier: ip,
      limit: 5,
      windowSeconds: 10 * 60,
      blockSeconds: 20 * 60,
    });

    if (!ipRateLimit.allowed) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Has solicitado demasiados códigos. Intenta nuevamente en unos minutos.",
        },
        { status: 429 },
      );
    }

    const emailRateLimit = await consumeRateLimit({
      action: "send_verification_code_email",
      identifier: cleanEmail,
      limit: 3,
      windowSeconds: 10 * 60,
      blockSeconds: 10 * 60,
    });

    if (!emailRateLimit.allowed) {
      return NextResponse.json(
        {
          success: false,
          error: "Debes esperar un momento antes de reenviar el código.",
        },
        { status: 429 },
      );
    }

    const resendApiKey = process.env.RESEND_API_KEY?.trim();
    const emailFrom = process.env.EMAIL_FROM?.trim();

    if (!resendApiKey || !emailFrom) {
      console.error("[send-verification-code] configuración incompleta", {
        hasResendApiKey: Boolean(resendApiKey),
        hasEmailFrom: Boolean(emailFrom),
      });

      return NextResponse.json(
        {
          success: false,
          error: "No se pudo enviar el código de verificación.",
        },
        { status: 500 },
      );
    }

    await ensureAuthSecuritySchema();
    const resend = new Resend(resendApiKey);
    const connection = await pool.getConnection();

    try {
      const userColumns = await getUserColumns(connection);
      const passwordColumn = userColumns.has("password_hash")
        ? "password_hash"
        : userColumns.has("password")
          ? "password"
          : null;

      if (!passwordColumn) {
        return NextResponse.json(
          {
            success: false,
            error: "La base no soporta verificación por correo.",
          },
          { status: 500 },
        );
      }

      const [existingUsers] = await connection.query<ExistingUserRow[]>(
        `
          SELECT id, email_verified, verification_sent_at
          FROM users
          WHERE LOWER(TRIM(email)) = ?
          LIMIT 1
        `,
        [cleanEmail],
      );

      const existingUser = existingUsers[0] ?? null;

      if (
        existingUser &&
        (existingUser.email_verified === true ||
          existingUser.email_verified === 1)
      ) {
        return NextResponse.json(
          {
            success: false,
            error: "Este correo ya está verificado. Inicia sesión.",
          },
          { status: 409 },
        );
      }

      if (existingUser?.verification_sent_at) {
        const sentAt = new Date(existingUser.verification_sent_at).getTime();
        if (Number.isFinite(sentAt) && Date.now() - sentAt < 60 * 1000) {
          return NextResponse.json(
            {
              success: false,
              error: "Espera al menos 1 minuto antes de solicitar otro código.",
            },
            { status: 429 },
          );
        }
      }

      const code = generateSixDigitCode();

      await connection.beginTransaction();

      if (existingUser) {
        await connection.query<ResultSetHeader>(
          `
            UPDATE users
            SET
              verification_code = ?,
              verification_expires_at = DATE_ADD(NOW(), INTERVAL 10 MINUTE),
              verification_sent_at = NOW(),
              email_verified = 0,
              updated_at = NOW()
            WHERE id = ?
          `,
          [code, existingUser.id],
        );
      } else {
        const temporaryPasswordHash = await hashPassword(
          `${cleanEmail}:${Date.now()}:${Math.random().toString(36).slice(2)}`,
        );
        const statusId = userColumns.has("status_id")
          ? await getInactiveAuthStatusId()
          : null;

        const insertColumns = [
          "email",
          passwordColumn,
          "verification_code",
          "email_verified",
        ];
        const placeholders = ["?", "?", "?", "?"];
        const values: Array<string | number | boolean | null> = [
          cleanEmail,
          temporaryPasswordHash,
          code,
          false,
        ];

        if (userColumns.has("first_name")) {
          insertColumns.push("first_name");
          placeholders.push("?");
          values.push(firstName);
        }

        if (userColumns.has("last_name")) {
          insertColumns.push("last_name");
          placeholders.push("?");
          values.push(lastName);
        }

        if (userColumns.has("phone")) {
          insertColumns.push("phone");
          placeholders.push("?");
          values.push(phone);
        }

        if (userColumns.has("verification_expires_at")) {
          insertColumns.push("verification_expires_at");
          placeholders.push("DATE_ADD(NOW(), INTERVAL 10 MINUTE)");
        }

        if (userColumns.has("verification_sent_at")) {
          insertColumns.push("verification_sent_at");
          placeholders.push("NOW()");
        }

        if (userColumns.has("status_id")) {
          insertColumns.push("status_id");
          placeholders.push("?");
          values.push(statusId);
        }

        await connection.query<ResultSetHeader>(
          `
            INSERT INTO users (${insertColumns.join(", ")})
            VALUES (${placeholders.join(", ")})
          `,
          values,
        );
      }

      const resendResponse = await resend.emails.send({
        from: emailFrom,
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
              <p style="color:#999; font-size:12px;">Si no solicitaste este código, ignora este mensaje.</p>
            </div>
          </div>
        `,
      });

      if (resendResponse.error) {
        await connection.rollback();
        console.error("[send-verification-code] resend error", {
          message: resendResponse.error.message,
          email: maskEmailForLogs(cleanEmail),
        });

        return NextResponse.json(
          {
            success: false,
            error: "No se pudo enviar el código de verificación.",
          },
          { status: 500 },
        );
      }

      await connection.commit();
      await recordAuthAuditLog({
        action: "verification_code_sent",
        email: cleanEmail,
        ip,
        userAgent,
      });

      return NextResponse.json({
        success: true,
        message: "Código enviado correctamente.",
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
    return legacyErrorResponse(req, {
      event: "auth.send_verification_code_error",
      error,
      message: "No se pudo enviar el código de verificación.",
      body: { success: false },
    });
  }
}
