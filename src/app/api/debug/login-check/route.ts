/* ENDPOINT TEMPORAL DE DEBUG - BORRAR ANTES DE PRODUCCIÓN */

import jwt from "jsonwebtoken";
import { NextResponse } from "next/server";

import { findAuthUserByEmail } from "@/lib/auth-users";
import { prisma } from "@/lib/prisma";

const DEBUG_EMAIL = "yaritzachavezc@gmail.com";

type LoginDebugChecks = {
  databaseUrlExists: boolean;
  jwtSecretExists: boolean;
  dbConnected: boolean;
  userFound: boolean;
  userId: number | null;
  foundEmail: string | null;
  passwordExists: boolean;
  passwordLength: number | null;
  rolesReadable: boolean;
  roleCount: number;
  jwtCanSign: boolean;
  stepErrors: Record<string, string>;
};

export const dynamic = "force-dynamic";

export async function GET() {
  const checks: LoginDebugChecks = {
    databaseUrlExists: Boolean(process.env.DATABASE_URL),
    jwtSecretExists: Boolean(process.env.JWT_SECRET),
    dbConnected: false,
    userFound: false,
    userId: null,
    foundEmail: null,
    passwordExists: false,
    passwordLength: null,
    rolesReadable: false,
    roleCount: 0,
    jwtCanSign: false,
    stepErrors: {},
  };

  try {
    await prisma.$queryRaw`SELECT 1`;
    checks.dbConnected = true;
  } catch (error) {
    checks.stepErrors.dbConnection =
      error instanceof Error ? error.message : "No se pudo conectar con Prisma";
  }

  let user:
    | {
        id: number;
        email: string;
        password: string;
      }
    | null = null;

  try {
    user = await findAuthUserByEmail(DEBUG_EMAIL);

    checks.userFound = Boolean(user);
    checks.userId = user?.id ?? null;
    checks.foundEmail = user?.email ?? null;
    checks.passwordExists = Boolean(user?.password);
    checks.passwordLength = user?.password?.length ?? null;
  } catch (error) {
    checks.stepErrors.userLookup =
      error instanceof Error
        ? error.message
        : "No se pudo consultar el usuario";
  }

  if (user?.id) {
    try {
      const roles = await prisma.user_roles.findMany({
        where: {
          user_id: user.id,
        },
        select: {
          roles: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      });

      checks.rolesReadable = true;
      checks.roleCount = roles.length;
    } catch (error) {
      checks.stepErrors.roles =
        error instanceof Error ? error.message : "No se pudieron leer roles";
    }
  }

  try {
    if (!process.env.JWT_SECRET) {
      throw new Error("Falta JWT_SECRET");
    }

    jwt.sign(
      {
        id: user?.id ?? 0,
        email: user?.email ?? DEBUG_EMAIL,
      },
      process.env.JWT_SECRET,
      { expiresIn: "5m" },
    );

    checks.jwtCanSign = true;
  } catch (error) {
    checks.stepErrors.jwt =
      error instanceof Error ? error.message : "No se pudo firmar JWT";
  }

  return NextResponse.json({
    success: true,
    checks,
  });
}
