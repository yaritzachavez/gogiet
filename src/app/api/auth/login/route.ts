import bcrypt from "bcrypt";
import jwt, { type SignOptions } from "jsonwebtoken";
import { NextResponse } from "next/server";

import { normalizeEmail } from "@/lib/auth-account";
import {
  createUserSession,
  getDeviceName,
  getLocationLabel,
} from "@/lib/admin-security";
import pool, { logDbUsage } from "@/lib/db";
import { isUserTemporarilyVerified } from "@/lib/email-verification";
import { mapDbRolesToPublicRoles } from "@/lib/role-utils";
import { handleCorsPreflight, withCors } from "@/lib/server/cors";

type UserRow = {
  id: number;
  first_name: string;
  last_name: string | null;
  email: string;
  password_hash: string;
  status_id: number;
  email_verified: number | boolean | null;
  verification_code: string | null;
  verification_expires_at: string | null;
  login_attempts: number | null;
  locked_until: string | null;
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

    if (!normalizedEmail || !password) {
      return json(
        {
          success: false,
          error: "Completa tu correo y contraseña para continuar.",
        },
        { status: 400 },
      );
    }

    const [rows] = await pool.query(
      `
      SELECT
        id,
        first_name,
        last_name,
        email,
        password_hash,
        status_id,
        email_verified,
        verification_code,
        verification_expires_at,
        login_attempts,
        locked_until
      FROM users
      WHERE email = ?
      `,
      [normalizedEmail],
    );
    const users = rows as UserRow[];

    console.log(
      "POST /api/auth/login encontro usuario:",
      users.length > 0 ? users[0].id : null,
    );

    if (users.length === 0) {
      return json(
        {
          success: false,
          error: "No encontramos una cuenta con ese correo.",
        },
        { status: 404 },
      );
    }

    const user = users[0];

    if (Number(user.status_id ?? 0) !== 1) {
      return json(
        {
          success: false,
          error: "Tu cuenta está inactiva. Contacta a soporte.",
        },
        { status: 403 },
      );
    }

    if (user.locked_until && new Date(user.locked_until).getTime() > Date.now()) {
      return json(
        {
          success: false,
          error:
            "Tu cuenta está temporalmente bloqueada por demasiados intentos. Intenta nuevamente en unos minutos.",
        },
        { status: 429 },
      );
    }

    if (!user.password_hash) {
      console.error("POST /api/auth/login usuario sin password_hash:", user.id);
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
      user.password_hash,
    );

    console.log("POST /api/auth/login password valida:", passwordMatch);

    if (!passwordMatch) {
      const attempts = Number(user.login_attempts ?? 0) + 1;
      const shouldLock = attempts >= 5;

      await pool.query(
        `
        UPDATE users
        SET login_attempts = ?, locked_until = ?, updated_at = NOW()
        WHERE id = ?
        `,
        [shouldLock ? 0 : attempts, shouldLock ? new Date(Date.now() + 15 * 60 * 1000) : null, user.id],
      );

      return json(
        {
          success: false,
          error: shouldLock
            ? "Tu cuenta está temporalmente bloqueada por demasiados intentos. Intenta nuevamente en unos minutos."
            : "La contraseña no es correcta.",
        },
        { status: shouldLock ? 429 : 401 },
      );
    }

    if (
      !isUserTemporarilyVerified({
        email_verified:
          user.email_verified === null ? null : Boolean(user.email_verified),
        verification_code: user.verification_code,
        verification_expires_at: user.verification_expires_at,
      })
    ) {
      return json(
        {
          success: false,
          error: "Debes verificar tu correo antes de iniciar sesión",
        },
        { status: 403 },
      );
    }

    const [roleRows] = await pool.query(
      `
      SELECT r.id, r.name
      FROM user_roles ur
      INNER JOIN roles r ON r.id = ur.role_id
      WHERE ur.user_id = ?
      `,
      [user.id],
    );

    const roles = roleRows as { id: number; name: string }[];
    const dbRoles = roles.map((role) => role.name);
    const publicRoles = mapDbRolesToPublicRoles(dbRoles);
    const primaryRole = publicRoles[0] ?? null;

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
        name: `${user.first_name} ${user.last_name ?? ""}`.trim(),
        roles: dbRoles,
      },
      secret,
      options,
    );

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
    } catch (sessionError) {
      console.warn(
        "POST /api/auth/login no pudo registrar la sesión, pero el login seguirá:",
        sessionError,
      );
    }

    await pool.query(
      `
      UPDATE users
      SET login_attempts = 0, locked_until = NULL, last_login = NOW(), updated_at = NOW()
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
        name: `${user.first_name} ${user.last_name ?? ""}`.trim(),
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
