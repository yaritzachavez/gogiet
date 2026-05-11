import bcrypt from "bcrypt";
import jwt, { type SignOptions } from "jsonwebtoken";
import { NextResponse } from "next/server";

import { normalizeEmail } from "@/lib/auth-account";
import {
  createUserSession,
  getDeviceName,
  getLocationLabel,
} from "@/lib/admin-security";
import pool, { getDbRuntimeConfig, logDbUsage } from "@/lib/db";
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
  try {
    const json = (body: unknown, init?: ResponseInit) =>
      withCors(req, NextResponse.json(body, init));

    const body = (await req.json().catch(() => null)) as
      | { email?: string; password?: string }
      | null;
    const { email, password } = body ?? {};
    const normalizedEmail = normalizeEmail(email ?? "");

    console.log("POST /api/auth/login email recibido:", normalizedEmail);
    logDbUsage("/api/auth/login", {
      email: normalizedEmail,
    });
    console.log("POST /api/auth/login db runtime:", getDbRuntimeConfig());

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

    let user = (await prisma.user.findUnique({
      where: {
        email: normalizedEmail,
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        password: true,
        statusId: true,
      },
    })) as AuthUserRecord | null;

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

    if (!user && rawEmail && rawEmail !== normalizedEmail) {
      const fallbackUser = (await prisma.user.findFirst({
        where: {
          email: rawEmail,
        },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          password: true,
          statusId: true,
        },
      })) as AuthUserRecord | null;

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
      const [normalizedRows] = await pool.query(
        `
        SELECT id
        FROM users
        WHERE LOWER(TRIM(email)) = ?
        LIMIT 1
        `,
        [normalizedEmail],
      );

      const normalizedMatches = normalizedRows as Array<{ id?: number }>;
      const normalizedMatchId = Number(normalizedMatches[0]?.id ?? 0);

      console.log("LOGIN FALLBACK LOWER(TRIM(email)) MATCH:", {
        found: normalizedMatchId > 0,
        id: normalizedMatchId > 0 ? normalizedMatchId : null,
      });

      if (normalizedMatchId > 0) {
        user = (await prisma.user.findUnique({
          where: {
            id: normalizedMatchId,
          },
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            password: true,
            statusId: true,
          },
        })) as AuthUserRecord | null;

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
    const passwordMatch = await bcrypt.compare(
      password + pepper,
      user.password,
    );

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
      const [roleRows] = await pool.query(
        `
        SELECT r.id, r.name
        FROM user_roles ur
        INNER JOIN roles r ON r.id = ur.role_id
        WHERE ur.user_id = ?
        `,
        [user.id],
      );

      roles = roleRows as { id: number; name: string }[];
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

    await pool.query(
      `
      UPDATE users
      SET last_login = NOW(), updated_at = NOW()
      WHERE id = ?
      `,
      [user.id],
    );

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
    console.error("LOGIN ERROR:", error);
    console.error("POST /api/auth/login error exacto:", error);

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
    }

    return withCors(
      req,
      NextResponse.json(
      {
        success: false,
        error: "Ocurrió un problema en el servidor. Intenta nuevamente.",
      },
      { status: 500 },
      ),
    );
  }
}
