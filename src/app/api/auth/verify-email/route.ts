import { NextResponse } from "next/server";

import { ensureUserAuthSecurityColumns, normalizeEmail } from "@/lib/auth-account";
import { prisma } from "@/lib/prisma";

type VerifyEmailBody = {
  email?: string;
  code?: string;
};

export async function POST(req: Request) {
  try {
    await ensureUserAuthSecurityColumns();
    const body = (await req.json()) as VerifyEmailBody;
    const email = normalizeEmail(body.email ?? "");
    const code = String(body.code ?? "").trim();

    if (!email || !code) {
      return NextResponse.json(
        { success: false, error: "Ingresa tu correo y el código de verificación." },
        { status: 400 },
      );
    }

    const user = await prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        verification_code: true,
        verification_expires_at: true,
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
      return NextResponse.json({
        success: true,
        message: "Correo verificado correctamente",
      });
    }

    if (!user.verification_code || user.verification_code !== code) {
      return NextResponse.json(
        { success: false, error: "Código inválido." },
        { status: 400 },
      );
    }

    if (
      !user.verification_expires_at ||
      user.verification_expires_at.getTime() < Date.now()
    ) {
      return NextResponse.json(
        { success: false, error: "El código expiró." },
        { status: 400 },
      );
    }

    await prisma.user.update({
      where: { id: user.id },
      data: {
        email_verified: true,
        verification_code: null,
        verification_expires_at: null,
      },
    });

    return NextResponse.json({
      success: true,
      message: "Correo verificado correctamente",
    });
  } catch (error) {
    console.error("Error POST /api/auth/verify-email:", error);
    return NextResponse.json(
      { success: false, error: "No se pudo verificar el correo" },
      { status: 500 },
    );
  }
}
