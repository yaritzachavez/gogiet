import bcrypt from "bcrypt";
import { NextResponse } from "next/server";

import {
  generateVerificationCode,
  generateVerificationExpiration,
  sendVerificationCodeEmail,
} from "@/lib/email-verification";
import { prisma } from "@/lib/prisma";
import { mapPublicRoleToDbRole } from "@/lib/role-utils";

type RegisterBody = {
  firstName?: string;
  lastName?: string;
  name?: string;
  email?: string;
  phone?: string;
  password?: string;
};

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as RegisterBody;
    const firstName = body.firstName?.trim();
    const lastName = body.lastName?.trim();
    const fallbackName = body.name?.trim();
    const name = fallbackName || `${firstName ?? ""} ${lastName ?? ""}`.trim();
    const email = body.email?.trim().toLowerCase();
    const phone = body.phone?.trim() || null;
    const password = body.password;

    if (!firstName && !fallbackName) {
      return NextResponse.json(
        {
          success: false,
          error: "El nombre es obligatorio",
        },
        { status: 400 },
      );
    }

    if (!lastName && !fallbackName) {
      return NextResponse.json(
        {
          success: false,
          error: "El apellido es obligatorio",
        },
        { status: 400 },
      );
    }

    if (!email) {
      return NextResponse.json(
        {
          success: false,
          error: "El correo es obligatorio",
        },
        { status: 400 },
      );
    }

    if (!phone) {
      return NextResponse.json(
        {
          success: false,
          error: "El teléfono es obligatorio",
        },
        { status: 400 },
      );
    }

    if (!password) {
      return NextResponse.json(
        {
          success: false,
          error: "La contraseña es obligatoria",
        },
        { status: 400 },
      );
    }

    if (!isValidEmail(email)) {
      return NextResponse.json(
        {
          success: false,
          error: "El email no tiene un formato válido",
        },
        { status: 400 },
      );
    }

    if (password.length < 8) {
      return NextResponse.json(
        {
          success: false,
          error: "La contraseña debe tener al menos 8 caracteres",
        },
        { status: 400 },
      );
    }

    const existingUser = await prisma.user.findUnique({
      where: { email },
      select: { id: true },
    });

    if (existingUser) {
      return NextResponse.json(
        {
          success: false,
          error: "Este correo ya está registrado",
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
        return NextResponse.json(
          {
            success: false,
            error: "Este teléfono ya está registrado",
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

      return NextResponse.json(
        {
          success: false,
          error: "No se pudo enviar el código de verificación",
        },
        { status: 500 },
      );
    }

    return NextResponse.json(
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
      return NextResponse.json(
        {
          success: false,
          error: "Este correo o teléfono ya está registrado",
        },
        { status: 409 },
      );
    }

    if (
      error instanceof Error &&
      error.message.toLowerCase().includes("duplicate entry")
    ) {
      return NextResponse.json(
        {
          success: false,
          error: "Este correo o teléfono ya está registrado",
        },
        { status: 409 },
      );
    }

    return NextResponse.json(
      {
        success: false,
        error: "Error interno al crear la cuenta",
      },
      { status: 500 },
    );
  }
}
