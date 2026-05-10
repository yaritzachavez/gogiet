import { NextResponse } from "next/server";

import {
  ensureUserAuthSecurityColumns,
  isCooldownActive,
  normalizeEmail,
} from "@/lib/auth-account";
import {
  generateVerificationCode,
  generateVerificationExpiration,
  sendVerificationCodeEmail,
} from "@/lib/email-verification";
import { prisma } from "@/lib/prisma";

type ResendCodeBody = {
  email?: string;
};

export async function POST(req: Request) {
  try {
    await ensureUserAuthSecurityColumns();
    const body = (await req.json()) as ResendCodeBody;
    const email = normalizeEmail(body.email ?? "");

    if (!email) {
      return NextResponse.json(
        { success: false, error: "El email es obligatorio" },
        { status: 400 },
      );
    }

    const user = await prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        email_verified: true,
        verification_sent_at: true,
      },
    });

    if (!user) {
      return NextResponse.json(
        { success: false, error: "No encontramos una cuenta con ese correo" },
        { status: 404 },
      );
    }

    if (user.email_verified) {
      return NextResponse.json(
        { success: false, error: "Este correo ya fue verificado" },
        { status: 400 },
      );
    }

    if (isCooldownActive(user.verification_sent_at, 60_000)) {
      return NextResponse.json(
        {
          success: false,
          error: "Espera un minuto antes de reenviar el código.",
        },
        { status: 429 },
      );
    }

    const verificationCode = generateVerificationCode();
    const verificationExpiresAt = generateVerificationExpiration();

    await prisma.user.update({
      where: { id: user.id },
      data: {
        email_verified: false,
        verification_code: verificationCode,
        verification_expires_at: verificationExpiresAt,
        verification_sent_at: new Date(),
      },
    });

    await sendVerificationCodeEmail(email, verificationCode);

    return NextResponse.json({
      success: true,
      message: "Te enviamos un código de verificación.",
    });
  } catch (error) {
    console.error("Error POST /api/auth/resend-code:", error);
    return NextResponse.json(
      { success: false, error: "No se pudo reenviar el código" },
      { status: 500 },
    );
  }
}
