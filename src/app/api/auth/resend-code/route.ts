import { NextResponse } from "next/server";

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
    const body = (await req.json()) as ResendCodeBody;
    const email = String(body.email ?? "")
      .trim()
      .toLowerCase();

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

    const verificationCode = generateVerificationCode();
    const verificationExpiresAt = generateVerificationExpiration();

    await prisma.user.update({
      where: { id: user.id },
      data: {
        email_verified: false,
        verification_code: verificationCode,
        verification_expires_at: verificationExpiresAt,
      },
    });

    await sendVerificationCodeEmail(email, verificationCode);

    return NextResponse.json({
      success: true,
      message: "Te enviamos un nuevo código de verificación",
    });
  } catch (error) {
    console.error("Error POST /api/auth/resend-code:", error);
    return NextResponse.json(
      { success: false, error: "No se pudo reenviar el código" },
      { status: 500 },
    );
  }
}
