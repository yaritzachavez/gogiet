import { NextResponse } from "next/server";

import {
  generateResetToken,
  generateTokenExpiration,
  hashToken,
  isCooldownActive,
  normalizeEmail,
  sendPasswordResetEmail,
} from "@/lib/auth-account";
import { prisma } from "@/lib/prisma";
import { handleCorsPreflight, withCors } from "@/lib/server/cors";

type ForgotPasswordBody = {
  email?: string;
};

export function OPTIONS(req: Request) {
  return handleCorsPreflight(req);
}

export async function POST(req: Request) {
  const json = (body: unknown, init?: ResponseInit) =>
    withCors(req, NextResponse.json(body, init));

  try {
    const body = (await req.json()) as ForgotPasswordBody;
    const email = normalizeEmail(body.email ?? "");

    if (!email) {
      return json({ success: false, error: "Ingresa un correo válido." }, { status: 400 });
    }

    const user = await prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        email: true,
        reset_password_sent_at: true,
      },
    });

    if (!user) {
      return json(
        { success: false, error: "No encontramos una cuenta con ese correo." },
        { status: 404 },
      );
    }

    if (isCooldownActive(user.reset_password_sent_at, 60_000)) {
      return json(
        {
          success: false,
          error: "Espera un minuto antes de solicitar otro enlace.",
        },
        { status: 429 },
      );
    }

    const resetToken = generateResetToken();
    const hashedResetToken = hashToken(resetToken);
    const resetExpiresAt = generateTokenExpiration(30);

    await prisma.user.update({
      where: { id: user.id },
      data: {
        reset_password_token: hashedResetToken,
        reset_password_expires_at: resetExpiresAt,
        reset_password_sent_at: new Date(),
      },
    });

    await sendPasswordResetEmail(user.email, resetToken);

    return json({
      success: true,
      message: "Te enviamos instrucciones para recuperar tu contraseña.",
    });
  } catch (error) {
    if (error instanceof Error && /bcrypt/i.test(error.message)) {
      console.error("Error inesperado de hash en forgot-password:", error);
    } else if (error instanceof Error) {
      console.error("Error POST /api/auth/forgot-password:", error.message);
    } else {
      console.error("Error POST /api/auth/forgot-password:", error);
    }

    return json(
      {
        success: false,
        error: "No pudimos enviar las instrucciones de recuperación.",
      },
      { status: 500 },
    );
  }
}
