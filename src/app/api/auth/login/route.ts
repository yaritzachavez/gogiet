import jwt, { type SignOptions } from "jsonwebtoken";
import { NextResponse } from "next/server";

import {
  createUserSession,
  getDeviceName,
  getLocationLabel,
} from "@/lib/admin-security";
import {
  clearFailedLoginAttempts,
  comparePassword,
  consumeRateLimit,
  ensureAuthSecuritySchema,
  getAuthCookieConfig,
  getRequestIp,
  getRequestUserAgent,
  getRolesForUser,
  isUserLocked,
  isValidEmail,
  normalizeEmail,
  recordAuthAuditLog,
  registerFailedLoginAttempt,
} from "@/lib/auth-security";
import {
  findAuthUserByEmail,
  getActiveAuthStatusId,
  updateAuthUserLastLogin,
} from "@/lib/auth-users";
import { JWT_SECRET } from "@/lib/env";
import { mapDbRolesToPublicRoles } from "@/lib/role-utils";
import { handleCorsPreflight, withCors } from "@/lib/server/cors";

type AuthUserRecord = {
  id: number;
  firstName: string;
  lastName: string | null;
  email: string;
  password: string;
  statusId: number;
  email_verified?: number | boolean | null;
  login_attempts?: number | null;
  locked_until?: Date | string | null;
};

type SqlLikeError = {
  code?: string;
  errno?: number;
  sqlMessage?: string;
  message?: string;
  stack?: string;
};

function genericLoginError() {
  return "Correo o contraseña incorrectos.";
}

export function OPTIONS(req: Request) {
  return handleCorsPreflight(req);
}

export async function POST(req: Request) {
  const json = (body: unknown, init?: ResponseInit) =>
    withCors(req, NextResponse.json(body, init));

  try {
    const body = (await req.json().catch(() => null)) as {
      email?: string;
      password?: string;
    } | null;
    const email = normalizeEmail(body?.email ?? "");
    const password = String(body?.password ?? "");
    const ip = getRequestIp(req);
    const userAgent = getRequestUserAgent(req);

    if (!email || !password) {
      return json(
        {
          success: false,
          error: "Completa tu correo y contraseña para continuar.",
        },
        { status: 400 },
      );
    }

    if (!isValidEmail(email)) {
      return json(
        { success: false, error: "Ingresa un correo válido." },
        { status: 400 },
      );
    }

    await ensureAuthSecuritySchema();

    const ipRateLimit = await consumeRateLimit({
      action: "login_ip",
      identifier: ip,
      limit: 15,
      windowSeconds: 15 * 60,
      blockSeconds: 20 * 60,
    });

    if (!ipRateLimit.allowed) {
      return json(
        {
          success: false,
          error:
            "Demasiados intentos de inicio de sesión. Intenta nuevamente más tarde.",
        },
        { status: 429 },
      );
    }

    const emailRateLimit = await consumeRateLimit({
      action: "login_email",
      identifier: email,
      limit: 10,
      windowSeconds: 15 * 60,
      blockSeconds: 15 * 60,
    });

    if (!emailRateLimit.allowed) {
      return json(
        {
          success: false,
          error:
            "Demasiados intentos de inicio de sesión. Intenta nuevamente más tarde.",
        },
        { status: 429 },
      );
    }

    const user = (await findAuthUserByEmail(email)) as AuthUserRecord | null;

    if (!user) {
      await recordAuthAuditLog({
        action: "login_failed",
        email,
        ip,
        userAgent,
        metadata: { reason: "user_not_found" },
      });

      return json(
        { success: false, error: genericLoginError() },
        { status: 401 },
      );
    }

    if (isUserLocked(user)) {
      return json(
        {
          success: false,
          error:
            "Tu cuenta está bloqueada temporalmente. Intenta nuevamente en unos minutos.",
        },
        { status: 429 },
      );
    }

    const passwordMatch = await comparePassword(password, user.password).catch(
      () => false,
    );

    if (!passwordMatch) {
      await registerFailedLoginAttempt(user.id);
      await recordAuthAuditLog({
        userId: user.id,
        action: "login_failed",
        email,
        ip,
        userAgent,
        metadata: { reason: "invalid_password" },
      });

      return json(
        { success: false, error: genericLoginError() },
        { status: 401 },
      );
    }

    const activeStatusId = await getActiveAuthStatusId();

    if (Number(user.statusId ?? 0) !== activeStatusId) {
      return json(
        {
          success: false,
          error: "Tu cuenta está inactiva. Contacta a soporte.",
        },
        { status: 403 },
      );
    }

    if (!(user.email_verified === true || user.email_verified === 1)) {
      return json(
        {
          success: false,
          error: "Debes verificar tu correo antes de iniciar sesión.",
        },
        { status: 403 },
      );
    }

    await clearFailedLoginAttempts(user.id);

    const roles = await getRolesForUser(user.id);
    const dbRoles = roles.map((role) => role.name);
    const publicRoles = mapDbRolesToPublicRoles(dbRoles);
    const primaryRole = publicRoles[0] ?? "customer";
    const hasRoles = roles.length > 0;
    const redirectTo = hasRoles ? "/pickdash" : "/";

    const expiresIn = (process.env.JWT_EXPIRES_IN ??
      process.env.JWT_EXPIRATION ??
      "9h") as unknown as SignOptions["expiresIn"];

    const token = jwt.sign(
      {
        id: user.id,
        name: `${user.firstName} ${user.lastName ?? ""}`.trim(),
        roles: dbRoles,
      },
      JWT_SECRET as jwt.Secret,
      { expiresIn },
    );

    try {
      await createUserSession({
        userId: user.id,
        token,
        deviceName: getDeviceName(req.headers.get("user-agent")),
        location: getLocationLabel(ip),
      });
    } catch (sessionError) {
      console.warn("LOGIN SESSION WARNING:", {
        message:
          sessionError instanceof Error
            ? sessionError.message
            : String(sessionError),
      });
    }

    try {
      await updateAuthUserLastLogin(user.id);
    } catch {}

    await recordAuthAuditLog({
      userId: user.id,
      action: "login_success",
      email,
      ip,
      userAgent,
      metadata: { roles: dbRoles },
    });

    const response = NextResponse.json({
      success: true,
      message: "Login exitoso",
      redirectTo,
      user: {
        id: user.id,
        name: `${user.firstName} ${user.lastName ?? ""}`.trim(),
        email: user.email,
        role: primaryRole,
        roles: publicRoles,
      },
    });

    response.cookies.set("authToken", token, getAuthCookieConfig());

    return withCors(req, response);
  } catch (error) {
    const sqlError =
      typeof error === "object" && error !== null
        ? (error as SqlLikeError)
        : null;

    console.error("LOGIN ERROR:", {
      code: sqlError?.code ?? null,
      errno: sqlError?.errno ?? null,
      sqlMessage: sqlError?.sqlMessage ?? null,
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : sqlError?.stack,
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
