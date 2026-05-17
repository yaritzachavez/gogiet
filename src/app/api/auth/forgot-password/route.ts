import type { RowDataPacket } from "mysql2/promise";
import { NextResponse } from "next/server";
import { Resend } from "resend";

import pool from "@/lib/db";
import {
  consumeRateLimit,
  createPasswordResetToken,
  ensureAuthSecuritySchema,
  getRequestIp,
  getRequestUserAgent,
  isValidEmail,
  maskEmailForLogs,
  normalizeEmail,
  recordAuthAuditLog,
} from "@/lib/auth-security";
import { handleCorsPreflight, withCors } from "@/lib/server/cors";

type UserRow = RowDataPacket & {
  id: number;
  email: string;
  email_verified?: number | boolean | null;
};

type SqlLikeError = {
  code?: string;
  errno?: number;
  sqlMessage?: string;
  message?: string;
  stack?: string;
};

function buildResetUrl(email: string, token: string) {
  const baseUrl =
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.APP_URL ||
    "https://www.gogieats.shop";

  const normalizedBaseUrl = baseUrl.replace(/\/$/, "");
  return `${normalizedBaseUrl}/reset-password?token=${encodeURIComponent(token)}&email=${encodeURIComponent(email)}`;
}

export function OPTIONS(req: Request) {
  return handleCorsPreflight(req);
}

export async function POST(req: Request) {
  const json = (body: unknown, init?: ResponseInit) =>
    withCors(req, NextResponse.json(body, init));

  try {
    const body = (await req.json()) as { email?: string };
    const email = normalizeEmail(body.email ?? "");
    const ip = getRequestIp(req);
    const userAgent = getRequestUserAgent(req);

    if (!email || !isValidEmail(email)) {
      return json({ success: false, error: "Ingresa un correo válido." }, { status: 400 });
    }

    const rateLimitByIp = await consumeRateLimit({
      action: "forgot_password_ip",
      identifier: ip,
      limit: 5,
      windowSeconds: 15 * 60,
      blockSeconds: 20 * 60,
    });

    if (!rateLimitByIp.allowed) {
      return json(
        {
          success: false,
          error: "Has solicitado demasiados enlaces de recuperación. Intenta nuevamente más tarde.",
        },
        { status: 429 },
      );
    }

    const rateLimitByEmail = await consumeRateLimit({
      action: "forgot_password_email",
      identifier: email,
      limit: 3,
      windowSeconds: 15 * 60,
      blockSeconds: 15 * 60,
    });

    if (!rateLimitByEmail.allowed) {
      return json(
        {
          success: false,
          error: "Debes esperar un momento antes de volver a solicitar la recuperación.",
        },
        { status: 429 },
      );
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

    await ensureAuthSecuritySchema();

    const [rows] = await pool.query<UserRow[]>(
      `
        SELECT id, email, email_verified
        FROM users
        WHERE LOWER(TRIM(email)) = ?
        LIMIT 1
      `,
      [email],
    );

    const user = rows[0];

    if (!user) {
      return json({
        success: true,
        message:
          "Si encontramos una cuenta asociada a ese correo, recibirás un enlace de recuperación.",
      });
    }

    const resetToken = await createPasswordResetToken({
      userId: user.id,
      email,
      ip,
      userAgent,
      expiresInMinutes: Number(process.env.PASSWORD_RESET_TOKEN_MINUTES ?? 30),
    });

    const resetUrl = buildResetUrl(email, resetToken);
    const resend = new Resend(resendApiKey);
    const resendResponse = await resend.emails.send({
      from: emailFrom,
      to: email,
      subject: "Recupera tu contraseña - Gogi Eats",
      html: `
        <div style="font-family: Arial, sans-serif; background:#f7f7f7; padding:24px;">
          <div style="max-width:480px; margin:auto; background:#ffffff; border-radius:16px; padding:24px;">
            <h2 style="color:#111;">Recupera tu contraseña</h2>
            <p style="color:#444;">Haz clic en el siguiente botón para crear una nueva contraseña:</p>
            <p style="margin:24px 0;">
              <a href="${resetUrl}" style="display:inline-block;padding:14px 18px;border-radius:12px;background:#ff6b00;color:#fff;text-decoration:none;font-weight:700;">
                Restablecer contraseña
              </a>
            </p>
            <p style="color:#666;">Este enlace expira en 30 minutos y solo se puede usar una vez.</p>
            <p style="color:#999; font-size:12px;">Si no solicitaste este cambio, ignora este mensaje.</p>
          </div>
        </div>
      `,
    });

    if (resendResponse.error) {
      console.error("FORGOT PASSWORD RESEND ERROR:", {
        message: resendResponse.error.message,
        email: maskEmailForLogs(email),
      });

      return json(
        { success: false, error: "No pudimos enviar el enlace de recuperación." },
        { status: 500 },
      );
    }

    await recordAuthAuditLog({
      userId: user.id,
      action: "password_reset_requested",
      email,
      ip,
      userAgent,
    });

    return json({
      success: true,
      message:
        "Si encontramos una cuenta asociada a ese correo, recibirás un enlace de recuperación.",
    });
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
