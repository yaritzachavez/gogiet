import bcrypt from "bcrypt";
import { NextResponse } from "next/server";

import {
  createAuthUser,
  findAuthUserByEmail,
  findUserIdByPhone,
} from "@/lib/auth-users";
import {
  isValidEmail,
  isValidPhone,
  normalizeEmail,
  normalizePhone,
  validatePasswordStrength,
} from "@/lib/auth-account";
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
  confirmPassword?: string;
};

export function OPTIONS(req: Request) {
  return handleCorsPreflight(req);
}

export async function POST(req: Request) {
  const json = (body: unknown, init?: ResponseInit) =>
    withCors(req, NextResponse.json(body, init));

  try {
    console.log("REGISTER START");
    const body = (await req.json()) as RegisterBody;
    const firstName = body.firstName?.trim();
    const lastName = body.lastName?.trim();
    const fallbackName = body.name?.trim();
    const name = fallbackName || `${firstName ?? ""} ${lastName ?? ""}`.trim();
    const email = normalizeEmail(body.email ?? "");
    const cleanPhone = String(body.phone ?? "").replace(/\D/g, "");
    console.log("EMAIL:", email);
    console.log("PHONE:", cleanPhone);
    const phone = cleanPhone || null;
    const password = body.password;
    const confirmPassword = body.confirmPassword;

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

    if (confirmPassword !== undefined && password !== confirmPassword) {
      return json(
        {
          success: false,
          error: "Las contraseñas no coinciden.",
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

    const existingUser = await findAuthUserByEmail(email);
    console.log("USUARIO EXISTENTE:", Boolean(existingUser));

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
      const existingPhoneId = await findUserIdByPhone(phone);

      if (existingPhoneId > 0) {
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
    console.log("PASSWORD HASH GENERADO:", Boolean(passwordHash));
    const resolvedFirstName = firstName || name.split(/\s+/)[0] || "";
    const resolvedLastName =
      lastName || name.split(/\s+/).slice(1).join(" ").trim() || null;

    const userCreateData: Record<string, unknown> = {
      firstName: resolvedFirstName,
      lastName: resolvedLastName,
      email,
      phone,
      password: passwordHash,
      statusId: 1,
    };

    const user = await createAuthUser({
      firstName: String(userCreateData.firstName),
      lastName:
        typeof userCreateData.lastName === "string"
          ? userCreateData.lastName
          : null,
      email,
      phone,
      passwordHash,
      statusId: Number(userCreateData.statusId),
    });

    if (!user) {
      throw new Error("No se pudo crear el usuario en la base de datos.");
    }
    console.log("USUARIO CREADO ID:", user.id);

    try {
      const defaultRoleName = mapPublicRoleToDbRole("CLIENTE");
      const defaultRole = await prisma.roles.findUnique({
        where: { name: defaultRoleName },
        select: { id: true, name: true },
      });

      if (defaultRole) {
        await prisma.user_roles.create({
          data: {
            user_id: user.id,
            role_id: defaultRole.id,
          },
        });
        console.log("ROL DEFAULT ASIGNADO");
      } else {
        console.warn("REGISTER DEFAULT ROLE NO ENCONTRADO:", defaultRoleName);
      }
    } catch (roleError) {
      console.warn("REGISTER ROLE ASSIGNMENT ERROR:", roleError);
    }

    return json(
      {
        success: true,
        message: "Usuario creado correctamente.",
        requiresVerification: false,
        email,
        user,
      },
      { status: 201 },
    );
  } catch (error: unknown) {
    console.error("REGISTER ERROR:", error);
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
        error:
          process.env.NODE_ENV === "development"
            ? String(error)
            : "Ocurrió un problema en el servidor. Intenta nuevamente.",
      },
      { status: 500 },
    );
  }
}
