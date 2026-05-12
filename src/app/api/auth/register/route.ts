import bcrypt from "bcrypt";
import { NextResponse } from "next/server";

import {
  isValidEmail,
  isValidPhone,
  normalizeEmail,
  validatePasswordStrength,
} from "@/lib/auth-account";
import {
  createAuthUser,
  findAuthUserByEmail,
  findUserIdByPhone,
  getActiveAuthStatusId,
} from "@/lib/auth-users";
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
    console.log("REGISTER ENV STATUS:", {
      hasDatabaseUrl: Boolean(process.env.DATABASE_URL),
      hasDbSslCa: Boolean(process.env.DB_CA || process.env.DB_SSL_CA),
      hasJwtSecret: Boolean(process.env.JWT_SECRET),
      hasPasswordPepper: Boolean(process.env.PASSWORD_PEPPER),
      hasSaltRounds: Boolean(process.env.SALT_ROUNDS),
    });
    console.log("REGISTER BODY FIELDS:", {
      hasFirstName: Boolean(body.firstName?.trim()),
      hasLastName: Boolean(body.lastName?.trim()),
      hasName: Boolean(body.name?.trim()),
      hasEmail: Boolean(body.email?.trim()),
      hasPhone: Boolean(body.phone?.trim()),
      hasPassword: Boolean(body.password),
      hasConfirmPassword: Boolean(body.confirmPassword),
    });
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
          error: "Este correo ya está registrado",
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
            error: "Este número de teléfono ya está registrado",
          },
          { status: 409 },
        );
      }
    }

    const configuredSaltRounds = Number(process.env.SALT_ROUNDS ?? 12);
    const saltRounds =
      Number.isFinite(configuredSaltRounds) && configuredSaltRounds > 0
        ? configuredSaltRounds
        : 12;
    const pepper = process.env.PASSWORD_PEPPER ?? "";
    const passwordHash = await bcrypt.hash(password + pepper, saltRounds);
    console.log("PASSWORD HASH GENERADO:", Boolean(passwordHash));
    console.log("REGISTER SECURITY CONFIG:", {
      hasPasswordPepper: Boolean(pepper),
      hasAppSecretHash: Boolean(process.env.APP_SECRET_HASH),
      hasJwtSecret: Boolean(process.env.JWT_SECRET),
      saltRounds,
    });
    const resolvedFirstName = firstName || name.split(/\s+/)[0] || "";
    const resolvedLastName =
      lastName || name.split(/\s+/).slice(1).join(" ").trim() || null;
    const activeStatusId = await getActiveAuthStatusId();

    const userCreateData: Record<string, unknown> = {
      firstName: resolvedFirstName,
      lastName: resolvedLastName,
      email,
      phone,
      password: passwordHash,
      statusId: activeStatusId,
    };

    console.log("REGISTER USER PAYLOAD:", {
      firstName: resolvedFirstName,
      lastName: resolvedLastName,
      email,
      phone,
      statusId: activeStatusId,
      hasPasswordHash: Boolean(passwordHash),
    });

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
      console.error("ERROR EN /api/auth/register:", {
        message:
          roleError instanceof Error ? roleError.message : String(roleError),
        stack: roleError instanceof Error ? roleError.stack : undefined,
        name: roleError instanceof Error ? roleError.name : undefined,
        error: roleError,
      });
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
    console.error("ERROR EN /api/auth/register:", {
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      name: error instanceof Error ? error.name : undefined,
      error,
    });

    return json(
      {
        success: false,
        error: "Ocurrió un problema en el servidor. Intenta nuevamente.",
      },
      { status: 500 },
    );
  }
}
