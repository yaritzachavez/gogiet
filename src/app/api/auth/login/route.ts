import jwt, { type SignOptions } from "jsonwebtoken";
import { NextResponse } from "next/server";

import {
  createUserSession,
  getDeviceName,
  getLocationLabel,
  hashSessionToken,
} from "@/lib/admin-security";
import {
  clearFailedLoginAttempts,
  comparePassword,
  consumeRateLimit,
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
import { getRequestLoggerContext, logger } from "@/lib/logger";
import { mapDbRolesToPublicRoles } from "@/lib/role-utils";
import { RuntimeSchemaError } from "@/lib/runtime-schema";
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

function resolveLoginRedirect(publicRoles: string[]) {
  if (publicRoles.includes("ADMIN_GENERAL")) {
    return "/admin";
  }

  if (
    publicRoles.includes("ADMIN_NEGOCIO") ||
    publicRoles.includes("VENDEDOR")
  ) {
    return "/business";
  }

  if (publicRoles.includes("REPARTIDOR")) {
    return "/delivery";
  }

  return "/shop";
}

export function OPTIONS(req: Request) {
  return handleCorsPreflight(req);
}

export async function POST(req: Request) {
  const json = (body: unknown, init?: ResponseInit) =>
    withCors(req, NextResponse.json(body, init));
  const requestContext = getRequestLoggerContext(req);

  try {
    logger.info(
      "auth.login_request_received",
      "[auth-login] request recibido",
      {
        ...requestContext,
        route: "/api/auth/login",
        method: "POST",
      },
    );

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

    logger.info(
      "auth.login_user_lookup",
      user
        ? "[auth-login] usuario encontrado"
        : "[auth-login] usuario no encontrado",
      {
        ...requestContext,
        route: "/api/auth/login",
        email,
        userId: user?.id ?? null,
      },
    );

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

    logger.info(
      "auth.login_password_checked",
      passwordMatch
        ? "[auth-login] password válida"
        : "[auth-login] password inválida",
      {
        ...requestContext,
        route: "/api/auth/login",
        userId: user.id,
        email,
      },
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
    const redirectTo = resolveLoginRedirect(publicRoles);
    const authCookieConfig = getAuthCookieConfig();

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

    const createdSession = await createUserSession({
      userId: user.id,
      token,
      deviceName: getDeviceName(req.headers.get("user-agent")),
      location: getLocationLabel(ip),
      expiresAt: new Date(Date.now() + authCookieConfig.maxAge * 1000),
    });

    logger.info("auth.login_session_created", "[auth-login] sesión creada", {
      ...requestContext,
      route: "/api/auth/login",
      sessionCreated: Boolean(createdSession.sessionId),
      sessionId: createdSession.sessionId,
      userId: user.id,
      expiresAt: createdSession.expiresAt,
    });

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

    response.cookies.set("authToken", token, authCookieConfig);

    logger.info("auth.login_cookie_set", "[auth-login] cookie seteada", {
      ...requestContext,
      route: "/api/auth/login",
      userId: user.id,
      cookieName: "authToken",
      tokenHashPreview: hashSessionToken(token).slice(0, 8),
      secure: authCookieConfig.secure,
      sameSite: authCookieConfig.sameSite,
      path: authCookieConfig.path,
      maxAge: authCookieConfig.maxAge,
    });

    return withCors(req, response);
  } catch (error) {
    const sqlError =
      typeof error === "object" && error !== null
        ? (error as SqlLikeError)
        : null;

    if (error instanceof RuntimeSchemaError) {
      logger.error(
        "auth.login_schema_error",
        "[auth-error] schema de autenticación no disponible",
        {
          ...requestContext,
          route: "/api/auth/login",
          error,
        },
      );

      return json(
        {
          success: false,
          error:
            "La base de autenticación no está actualizada. Ejecuta migraciones antes de iniciar sesión.",
        },
        { status: 503 },
      );
    }

    if (
      sqlError?.code === "ER_NO_SUCH_TABLE" ||
      sqlError?.code === "ER_BAD_FIELD_ERROR"
    ) {
      return json(
        {
          success: false,
          error:
            "La configuración de autenticación en base de datos está incompleta. Ejecuta migraciones y verifica el schema de sesiones.",
        },
        { status: 503 },
      );
    }

    if (
      sqlError?.code === "ER_TABLEACCESS_DENIED_ERROR" ||
      sqlError?.code === "ER_COLUMNACCESS_DENIED_ERROR" ||
      sqlError?.code === "ER_DBACCESS_DENIED_ERROR"
    ) {
      return json(
        {
          success: false,
          error:
            "La base de datos rechazó una operación de autenticación. Revisa permisos del usuario de producción.",
        },
        { status: 503 },
      );
    }

    if (
      error instanceof Error &&
      error.message.includes("Missing required environment variable")
    ) {
      return json(
        {
          success: false,
          error:
            "Falta una variable crítica de autenticación en el servidor. Revisa la configuración de producción.",
        },
        { status: 500 },
      );
    }

    logger.error("auth.login_error", "Error al iniciar sesión", {
      ...requestContext,
      code: sqlError?.code ?? null,
      errno: sqlError?.errno ?? null,
      message: error instanceof Error ? error.message : String(error),
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
