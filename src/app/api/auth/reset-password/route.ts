import bcrypt from "bcrypt";
import { NextResponse } from "next/server";

import {
  hashToken,
  validatePasswordStrength,
} from "@/lib/auth-account";
import { prisma } from "@/lib/prisma";
import { handleCorsPreflight, withCors } from "@/lib/server/cors";

type ResetPasswordBody = {
  token?: string;
  password?: string;
  confirmPassword?: string;
};

export function OPTIONS(req: Request) {
  return handleCorsPreflight(req);
}

export async function POST(req: Request) {
  const json = (body: unknown, init?: ResponseInit) =>
    withCors(req, NextResponse.json(body, init));

  try {
    const body = (await req.json()) as ResetPasswordBody;
    const token = String(body.token ?? "").trim();
    const password = String(body.password ?? "");
    const confirmPassword = String(body.confirmPassword ?? "");

    if (!token || !password || !confirmPassword) {
      return json(
        { success: false, error: "Completa todos los campos obligatorios." },
        { status: 400 },
      );
    }

    const passwordError = validatePasswordStrength(password);

    if (passwordError) {
      return json(
        { success: false, error: passwordError },
        { status: 400 },
      );
    }

    if (password !== confirmPassword) {
      return json(
        { success: false, error: "Las contraseñas no coinciden." },
        { status: 400 },
      );
    }

    const hashedToken = hashToken(token);

    const user = await prisma.user.findFirst({
      where: {
        reset_password_token: hashedToken,
      },
      select: {
        id: true,
        reset_password_expires_at: true,
      },
    });

    if (!user) {
      return json(
        { success: false, error: "El enlace expiró." },
        { status: 400 },
      );
    }

    if (
      !user.reset_password_expires_at ||
      user.reset_password_expires_at.getTime() < Date.now()
    ) {
      return json(
        { success: false, error: "El enlace expiró." },
        { status: 400 },
      );
    }

    const saltRounds = Number(process.env.SALT_ROUNDS ?? 12);
    const pepper = process.env.PASSWORD_PEPPER ?? "";
    const passwordHash = await bcrypt.hash(password + pepper, saltRounds);

    await prisma.user.update({
      where: { id: user.id },
      data: {
        password: passwordHash,
        reset_password_token: null,
        reset_password_expires_at: null,
        reset_password_sent_at: null,
        login_attempts: 0,
        locked_until: null,
      },
    });

    return json({
      success: true,
      message: "Tu contraseña fue actualizada correctamente.",
    });
  } catch (error) {
    console.error("Error POST /api/auth/reset-password:", error);
    return json(
      {
        success: false,
        error: "No pudimos actualizar tu contraseña. Intenta nuevamente.",
      },
      { status: 500 },
    );
  }
}
