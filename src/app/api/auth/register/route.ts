import bcrypt from "bcrypt";
import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { mapPublicRoleToDbRole } from "@/lib/role-utils";

type RegisterBody = {
  name?: string;
  email?: string;
  password?: string;
};

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as RegisterBody;
    const name = body.name?.trim();
    const email = body.email?.trim().toLowerCase();
    const password = body.password;

    if (!name || !email || !password) {
      return NextResponse.json(
        {
          success: false,
          error: "name, email y password son obligatorios",
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
          error: "El email ya está registrado",
        },
        { status: 409 },
      );
    }

    const saltRounds = Number(process.env.SALT_ROUNDS ?? 12);
    const pepper = process.env.PASSWORD_PEPPER ?? "";
    const passwordHash = await bcrypt.hash(password + pepper, saltRounds);

    const user = await prisma.user.create({
      data: {
        firstName: name,
        email,
        passwordHash,
        statusId: 1,
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
        createdAt: true,
      },
    });

    return NextResponse.json(
      {
        success: true,
        message: "Usuario registrado correctamente",
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
          error: "El email ya está registrado",
        },
        { status: 409 },
      );
    }

    return NextResponse.json(
      {
        success: false,
        error: "Error interno del servidor",
      },
      { status: 500 },
    );
  }
}
