import bcrypt from "bcrypt";
import jwt, { type SignOptions } from "jsonwebtoken";
import { NextResponse } from "next/server";

import { normalizeEmail } from "@/lib/auth-account";
import {
  createUserSession,
  getDeviceName,
  getLocationLabel,
} from "@/lib/admin-security";
import {
  findAuthUserByEmail,
  findAuthUserById,
  findNormalizedEmailMatchId,
  updateAuthUserLastLogin,
} from "@/lib/auth-users";
import { getDbRuntimeConfig, logDbUsage } from "@/lib/db";
import { prisma } from "@/lib/prisma";
import { mapDbRolesToPublicRoles } from "@/lib/role-utils";
import { handleCorsPreflight, withCors } from "@/lib/server/cors";

type AuthUserRecord = {
  id: number;
  firstName: string;
  lastName: string | null;
  email: string;
  password: string;
  statusId: number;
};

export function OPTIONS(req: Request) {
  return handleCorsPreflight(req);
}

export async function POST(req: Request) {
  let loginEmailForLog = "";
  let userFoundForLog = false;
  const debug = process.env.DEBUG_AUTH === "true";

  try {
    const json = (body: unknown, init?: ResponseInit) =>
      withCors(req, NextResponse.json(body, init));

    const body = (await req.json().catch(() => null)) as
      | { email?: string; password?: string }
      | null;
    const { email, password } = body ?? {};
    const normalizedEmail = normalizeEmail(email ?? "");
    loginEmailForLog = normalizedEmail;

    console.log("LOGIN START");
    console.log("DATABASE_URL EXISTS:", Boolean(process.env.DATABASE_URL));
    console.log("JWT_SECRET EXISTS:", Boolean(process.env.JWT_SECRET));
    console.log("EMAIL NORMALIZADO:", normalizedEmail);
    console.log("POST /api/auth/login email recibido:", normalizedEmail);
    console.log("LOGIN EMAIL:", normalizedEmail);
    logDbUsage("/api/auth/login", {
      email: normalizedEmail,
    });
    console.log("POST /api/auth/login db runtime:", getDbRuntimeConfig());
    console.log("JWT_SECRET EXISTS:", Boolean(process.env.JWT_SECRET));
    console.log("POST /api/auth/login env status:", {
      hasDatabaseUrl: Boolean(process.env.DATABASE_URL),
      hasDbHost: Boolean(process.env.DB_HOST),
      hasDbUser: Boolean(process.env.DB_USER),
      hasDbPassword: Boolean(process.env.DB_PASSWORD || process.env.DB_PASS),
      hasDbName: Boolean(process.env.DB_NAME),
      hasJwtSecret: Boolean(process.env.JWT_SECRET),
      hasPasswordPepper: Boolean(process.env.PASSWORD_PEPPER),
      hasDbSslCa: Boolean(process.env.DB_SSL_CA || process.env.DB_CA),
    });

    if (
      !process.env.DATABASE_URL &&
      !(process.env.DB_HOST && process.env.DB_USER && process.env.DB_NAME)
    ) {
      console.error(
        "POST /api/auth/login configuración incompleta de base de datos",
      );
      return json(
        {
          success: false,
          error:
            "La conexión de base de datos no está configurada correctamente.",
        },
        { status: 500 },
      );
    }

    if (!process.env.JWT_SECRET) {
      console.error("POST /api/auth/login falta JWT_SECRET");
      return json(
        {
          success: false,
          error: "La autenticación no está configurada correctamente.",
        },
        { status: 500 },
      );
    }

    if (!normalizedEmail || !password) {
      return json(
        {
          success: false,
          error: "Completa tu correo y contraseña para continuar.",
        },
        { status: 400 },
      );
    }

    const rawEmail = String(email ?? "").trim();

    let user = (await findAuthUserByEmail(normalizedEmail)) as AuthUserRecord | null;

    console.log("EMAIL BUSCADO:", normalizedEmail);
    console.log("EMAIL ORIGINAL:", rawEmail);
    console.log(
      "USUARIO ENCONTRADO:",
      user
        ? {
            id: user.id,
            email: user.email,
            statusId: user.statusId,
            fields: Object.keys(user).filter((field) => field !== "password"),
          }
        : null,
    );
    userFoundForLog = Boolean(user);
    console.log("USER FOUND:", Boolean(user));

    if (!user && rawEmail && rawEmail !== normalizedEmail) {
      const fallbackUser = (await findAuthUserByEmail(rawEmail)) as AuthUserRecord | null;

      console.log(
        "USUARIO ENCONTRADO FALLBACK RAW EMAIL:",
        fallbackUser
          ? {
              id: fallbackUser.id,
              email: fallbackUser.email,
              statusId: fallbackUser.statusId,
              fields: Object.keys(fallbackUser).filter((field) => field !== "password"),
            }
          : null,
      );
      userFoundForLog = Boolean(fallbackUser);
      console.log("USER FOUND:", Boolean(fallbackUser));

      if (fallbackUser) {
        return json(
          {
            success: false,
            error:
              "Encontramos la cuenta con un formato de correo distinto en la base de datos. Intenta nuevamente o actualiza el correo registrado.",
          },
          { status: 409 },
        );
      }
    }

    if (!user) {
      const normalizedMatchId = await findNormalizedEmailMatchId(normalizedEmail);

      console.log("LOGIN FALLBACK LOWER(TRIM(email)) MATCH:", {
        found: normalizedMatchId > 0,
        id: normalizedMatchId > 0 ? normalizedMatchId : null,
      });

      if (normalizedMatchId > 0) {
        user = (await findAuthUserById(normalizedMatchId)) as AuthUserRecord | null;

        console.log(
          "USUARIO ENCONTRADO POR FALLBACK NORMALIZED EMAIL:",
          user
            ? {
                id: user.id,
                email: user.email,
                statusId: user.statusId,
                fields: Object.keys(user).filter((field) => field !== "password"),
              }
            : null,
        );
        userFoundForLog = Boolean(user);
        console.log("USER FOUND:", Boolean(user));
      }
    }

    if (!user) {
      return json(
        {
          success: false,
          error: "No encontramos una cuenta con ese correo.",
        },
        { status: 404 },
      );
    }

    if (Number(user.statusId ?? 0) !== 1) {
      return json(
        {
          success: false,
          error: "Tu cuenta está inactiva. Contacta a soporte.",
        },
        { status: 403 },
      );
    }

    if (!user.password) {
      console.error("POST /api/auth/login usuario sin password:", user.id);
      return json(
        {
          success: false,
          error: "Ocurrió un problema en el servidor. Intenta nuevamente.",
        },
        { status: 500 },
      );
    }

    const pepper = process.env.PASSWORD_PEPPER ?? "";
    let passwordMatch = false;

    try {
      passwordMatch = await bcrypt.compare(password + pepper, user.password);
    } catch (bcryptError) {
      console.error(
        "POST /api/auth/login bcrypt.compare falló, se tratará como contraseña incorrecta:",
        bcryptError,
      );
      passwordMatch = false;
    }

    console.log("POST /api/auth/login password valida:", passwordMatch);
    console.log("bcrypt ok:", passwordMatch);

    if (!passwordMatch) {
      return json(
        {
          success: false,
          error: "La contraseña no es correcta.",
        },
        { status: 401 },
      );
    }

    let roles: Array<{ id: number; name: string }> = [];
    let dbRoles: string[] = [];
    let publicRoles: string[] = [];
    let primaryRole: string | null = null;

    try {
      const roleRows = await prisma.user_roles.findMany({
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

      roles = roleRows.map((row) => row.roles);
      dbRoles = roles.map((role) => role.name);
      publicRoles = mapDbRolesToPublicRoles(dbRoles);
      primaryRole = publicRoles[0] ?? null;
      console.log("roles encontrados:", {
        count: roles.length,
        dbRoles,
        publicRoles,
      });
    } catch (roleError) {
      console.warn("POST /api/auth/login no pudo cargar roles:", roleError);
      roles = [];
      dbRoles = [];
      publicRoles = ["customer"];
      primaryRole = "customer";
    }

    if (publicRoles.length === 0) {
      publicRoles = ["customer"];
      primaryRole = "customer";
    }

    console.log("POST /api/auth/login role del usuario:", {
      dbRoles,
      publicRoles,
    });
    logDbUsage("/api/auth/login", {
      userId: user.id,
      email: user.email,
      role: publicRoles,
    });

    const hasRoles = roles.length > 0;
    const redirectTo = hasRoles ? "/pickdash" : "/";

    const secret: jwt.Secret =
      (process.env.JWT_SECRET as string) || "gogi-dev-secret";
    const expiresIn = (process.env.JWT_EXPIRES_IN ??
      "9h") as unknown as SignOptions["expiresIn"];

    const options: SignOptions = {
      expiresIn,
    };

    const token = jwt.sign(
      {
        id: user.id,
        name: `${user.firstName} ${user.lastName ?? ""}`.trim(),
        roles: dbRoles,
      },
      secret,
      options,
    );
    console.log("token creado:", {
      userId: user.id,
      hasRoles: dbRoles.length > 0,
      expiresIn,
      hasJwtSecret: Boolean(process.env.JWT_SECRET),
    });

    const deviceName = getDeviceName(req.headers.get("user-agent"));
    const forwardedFor =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
    const realIp = req.headers.get("x-real-ip");

    try {
      await createUserSession({
        userId: user.id,
        token,
        deviceName,
        location: getLocationLabel(forwardedFor || realIp),
      });
      console.log("sesión creada:", {
        userId: user.id,
        deviceName,
      });
    } catch (sessionError) {
      console.warn(
        "POST /api/auth/login no pudo registrar la sesión, pero el login seguirá:",
        sessionError,
      );
    }

    try {
      await updateAuthUserLastLogin(user.id);
    } catch (lastLoginError) {
      console.warn(
        "POST /api/auth/login no pudo actualizar last_login, pero el login seguirá:",
        lastLoginError,
      );
    }

    const response = NextResponse.json({
      success: true,
      message: "Login exitoso",
      token,
      redirectTo,
      user: {
        id: user.id,
        name: `${user.firstName} ${user.lastName ?? ""}`.trim(),
        email: user.email,
        role: primaryRole,
        roles: publicRoles,
      },
    });

    response.cookies.set("authToken", token, {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 9,
    });

    return withCors(req, response);
  } catch (error) {
    console.error("LOGIN ERROR FULL:", error);
    console.log("LOGIN EMAIL:", loginEmailForLog);
    console.log("USER FOUND:", userFoundForLog);
    console.log("JWT_SECRET EXISTS:", Boolean(process.env.JWT_SECRET));
    console.log("DEBUG_AUTH ENABLED:", debug);
    console.error("LOGIN ERROR:", error);
    console.error("POST /api/auth/login error exacto:", error);

    const debugPayload = debug
      ? {
          name: error instanceof Error ? error.name : "Unknown",
          message: error instanceof Error ? error.message : String(error),
          code:
            typeof error === "object" && error !== null
              ? (error as { code?: unknown }).code
              : undefined,
          meta:
            typeof error === "object" && error !== null
              ? (error as { meta?: unknown }).meta
              : undefined,
        }
      : undefined;

    if (typeof error === "object" && error !== null) {
      const prismaError = error as {
        name?: string;
        code?: string;
        clientVersion?: string;
        meta?: unknown;
        message?: string;
      };

      console.error("POST /api/auth/login prisma/meta:", {
        name: prismaError.name,
        code: prismaError.code,
        clientVersion: prismaError.clientVersion,
        meta: prismaError.meta,
        message: prismaError.message,
      });

      const message = String(prismaError.message ?? "");
      const code = String(prismaError.code ?? "");

      if (
        code === "P1001" ||
        code === "P1002" ||
        message.includes("Can't reach database server") ||
        message.includes("Timed out fetching a new connection") ||
        message.includes("Server has closed the connection")
      ) {
        return withCors(
          req,
          NextResponse.json(
            {
              success: false,
              error:
                "No se pudo conectar a la base de datos. Revisa la configuración de producción.",
              debug: debugPayload,
            },
            { status: 500 },
          ),
        );
      }

      if (
        code === "P1010" ||
        message.includes("User was denied access") ||
        message.includes("Access denied")
      ) {
        return withCors(
          req,
          NextResponse.json(
            {
              success: false,
              error:
                "La base de datos rechazó las credenciales configuradas en producción.",
              debug: debugPayload,
            },
            { status: 500 },
          ),
        );
      }
    }

    return withCors(
      req,
      NextResponse.json(
        {
          success: false,
          error:
            process.env.NODE_ENV === "development"
              ? String(error)
              : "Ocurrió un problema en el servidor. Intenta nuevamente.",
          debug: debugPayload,
        },
        { status: 500 },
      ),
    );
  }
}
