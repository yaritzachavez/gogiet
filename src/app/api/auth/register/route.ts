import bcrypt from "bcrypt";
import { NextResponse } from "next/server";

import {
  isValidEmail,
  isValidPhone,
  normalizeEmail,
  normalizePhone,
  validatePasswordStrength,
} from "@/lib/auth-account";
import {
  generateVerificationCode,
  generateVerificationExpiration,
  sendVerificationCodeEmail,
} from "@/lib/email-verification";
import { prisma } from "@/lib/prisma";
import { mapPublicRoleToDbRole } from "@/lib/role-utils";
import { handleCorsPreflight, withCors } from "@/lib/server/cors";

type RegisterBody = {
  firstName?: string;
  lastName?: string;
  name?: string;
  email?: string;
  phone?: string;
  password?: string;
};

export function OPTIONS(req: Request) {
  return handleCorsPreflight(req);
}

export async function POST(req: Request) {
  const json = (body: unknown, init?: ResponseInit) =>
    withCors(req, NextResponse.json(body, init));

  try {
    const body = (await req.json()) as RegisterBody;
    const firstName = body.firstName?.trim();
    const lastName = body.lastName?.trim();
    const fallbackName = body.name?.trim();
    const name = fallbackName || `${firstName ?? ""} ${lastName ?? ""}`.trim();
    const email = normalizeEmail(body.email ?? "");
    const phone = normalizePhone(body.phone ?? "") || null;
    const password = body.password;

    if (!firstName && !fallbackName) {
      return json(
        {
          success: false,
          error: "Completa todos los campos obligatorios.",
        },
        { status: 400 },
      );
    }

    if (!lastName && !fallbackName) {
      return json(
        {
          success: false,
          error: "Completa todos los campos obligatorios.",
        },
        { status: 400 },
      );
    }

    if (!email) {
      return json(
        {
          success: false,
          error: "Completa todos los campos obligatorios.",
        },
        { status: 400 },
      );
    }

    if (!phone) {
      return json(
        {
          success: false,
          error: "Completa todos los campos obligatorios.",
        },
        { status: 400 },
      );
    }

    if (!password) {
      return json(
        {
          success: false,
          error: "Completa todos los campos obligatorios.",
        },
        { status: 400 },
      );
    }

    if (!isValidEmail(email)) {
      return json(
        {
          success: false,
          error: "Ingresa un correo válido.",
        },
        { status: 400 },
      );
    }

    if (!phone || !isValidPhone(phone)) {
      return json(
        {
          success: false,
          error: "Ingresa un número de teléfono válido.",
        },
        { status: 400 },
      );
    }

    const passwordError = validatePasswordStrength(password);

    if (passwordError) {
      return json(
        {
          success: false,
          error: passwordError,
        },
        { status: 400 },
      );
    }

    const existingUser = await prisma.user.findUnique({
      where: { email },
      select: { id: true },
    });

    if (existingUser) {
      return json(
        {
          success: false,
          error: "El correo ya está registrado.",
        },
        { status: 409 },
      );
    }

    if (phone) {
      const existingPhone = await prisma.user.findFirst({
        where: { phone },
        select: { id: true },
      });

      if (existingPhone) {
        return json(
          {
            success: false,
            error: "El número de teléfono ya está registrado.",
          },
          { status: 409 },
        );
      }
    }

    const saltRounds = Number(process.env.SALT_ROUNDS ?? 12);
    const pepper = process.env.PASSWORD_PEPPER ?? "";
    const passwordHash = await bcrypt.hash(password + pepper, saltRounds);
    const verificationCode = generateVerificationCode();
    const verificationExpiresAt = generateVerificationExpiration();
    const resolvedFirstName = firstName || name.split(/\s+/)[0] || "";
    const resolvedLastName =
      lastName || name.split(/\s+/).slice(1).join(" ").trim() || null;

    const user = await prisma.user.create({
      data: {
        firstName: resolvedFirstName,
        lastName: resolvedLastName,
        email,
        phone,
        passwordHash,
        statusId: 1,
        email_verified: false,
        verification_code: verificationCode,
        verification_expires_at: verificationExpiresAt,
        verification_sent_at: new Date(),
        login_attempts: 0,
        locked_until: null,
        user_roles: {
          create: {
            roles: {
              connect: {
                name: mapPublicRoleToDbRole("CLIENTE"),
              },
            },
          },
        },
      },
      select: {
        id: true,
        firstName: true,
        email: true,
        phone: true,
        createdAt: true,
      },
    });

    try {
      await sendVerificationCodeEmail(email, verificationCode);
    } catch (emailError) {
      console.error("Error enviando código de verificación:", emailError);
      await prisma.user.delete({
        where: { id: user.id },
      });

      return json(
        {
          success: false,
          error: "No se pudo enviar el código de verificación.",
        },
        { status: 500 },
      );
    }

    return json(
      {
        success: true,
        message: "Usuario registrado. Revisa tu correo para verificar tu cuenta",
        requiresVerification: true,
        email,
        user,
      },
      { status: 201 },
    );
  } catch (error: unknown) {
    console.error("Error POST /api/auth/register:", error);

    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "P2002"
    ) {
      return json(
        {
          success: false,
          error: "El correo o el número de teléfono ya están registrados.",
        },
        { status: 409 },
      );
    }

    if (
      error instanceof Error &&
      error.message.toLowerCase().includes("duplicate entry")
    ) {
      return json(
        {
          success: false,
          error: "El correo o el número de teléfono ya están registrados.",
        },
        { status: 409 },
      );
    }

    return json(
      {
        success: false,
        error: "No pudimos crear tu cuenta. Intenta nuevamente.",
      },
      { status: 500 },
    );
  }
}
