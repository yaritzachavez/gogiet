import type { RowDataPacket } from "mysql2/promise";
import { type NextRequest, NextResponse } from "next/server";

import { ensureAddressesTable } from "@/lib/addresses-table";
import {
  getAuthUser,
  getSessionDiagnostics,
  hashSessionToken,
} from "@/lib/admin-security";
import pool from "@/lib/db";
import { getRequestLoggerContext, logger } from "@/lib/logger";
import { requireAuthenticatedUser } from "@/lib/permissions";
import { mapDbRoleToPublicRole } from "@/lib/role-utils";
import { handleCorsPreflight, withCors } from "@/lib/server/cors";

type AddressRow = RowDataPacket & {
  id: number;
  label: string | null;
  neighborhood: string;
  phone: string | null;
  street: string;
  external_number: string | null;
  internal_number: string | null;
  city: string;
  state: string;
};

type UserRow = RowDataPacket & {
  first_name: string | null;
  last_name: string | null;
  email: string | null;
};

export function OPTIONS(req: Request) {
  return handleCorsPreflight(req);
}

function formatFullAddress(address: AddressRow) {
  const numberBlock = [
    address.external_number?.trim(),
    address.internal_number?.trim()
      ? `Int. ${address.internal_number.trim()}`
      : "",
  ]
    .filter(Boolean)
    .join(" ");

  return [
    address.street,
    numberBlock,
    address.neighborhood,
    address.city,
    address.state,
  ]
    .filter(Boolean)
    .join(", ");
}

export async function GET(req: NextRequest) {
  const requestContext = getRequestLoggerContext(req);
  const json = (body: unknown, init?: ResponseInit) => {
    const response = NextResponse.json(body, init);
    response.headers.set(
      "Cache-Control",
      "no-store, no-cache, must-revalidate",
    );
    response.headers.set("Pragma", "no-cache");
    response.headers.set("Expires", "0");
    return withCors(req, response);
  };

  try {
    const cookieNames = req.cookies.getAll().map((cookie) => cookie.name);
    const authSnapshot = getAuthUser(req);
    const hasExpectedCookie = cookieNames.includes("authToken");
    const tokenHashPreview = authSnapshot.token
      ? hashSessionToken(authSnapshot.token).slice(0, 8)
      : null;
    const sessionDiagnostics = authSnapshot.token
      ? await getSessionDiagnostics(authSnapshot.token).catch(() => null)
      : null;

    const auth = await requireAuthenticatedUser(req);
    if (!auth.ok) {
      logger.info(
        "auth.me_invalid_session",
        "[auth-me] sesión inválida o ausente",
        {
          ...requestContext,
          route: "/api/auth/me",
          cookiesReceived: cookieNames,
          expectedCookieName: "authToken",
          hasExpectedCookie,
          tokenHashPreview,
          sessionFound: sessionDiagnostics?.found ?? false,
          sessionExpired: sessionDiagnostics?.expired ?? false,
          userFound: Boolean(authSnapshot.user),
        },
      );
      return withCors(req, auth.response);
    }

    await ensureAddressesTable();

    const [userRows] = await pool.query<UserRow[]>(
      `
        SELECT first_name, last_name, email
        FROM users
        WHERE id = ?
        LIMIT 1
      `,
      [auth.access.userId],
    );
    const userRow = userRows[0] ?? null;

    const [addressRows] = await pool.query<AddressRow[]>(
      `
        SELECT
          id,
          label,
          neighborhood,
          phone,
          street,
          external_number,
          internal_number,
          city,
          state
        FROM addresses
        WHERE user_id = ?
        ORDER BY is_default DESC, updated_at DESC
        LIMIT 1
      `,
      [auth.access.userId],
    );

    const address = addressRows[0] ?? null;

    logger.info("auth.me_user_detected", "[auth-me] usuario detectado", {
      ...requestContext,
      route: "/api/auth/me",
      cookiesReceived: cookieNames,
      expectedCookieName: "authToken",
      hasExpectedCookie,
      tokenHashPreview,
      sessionFound: sessionDiagnostics?.found ?? false,
      sessionExpired: sessionDiagnostics?.expired ?? false,
      userFound: Boolean(userRow),
      userId: auth.access.userId,
      role: auth.access.roles,
    });

    return json({
      success: true,
      user: {
        id: auth.access.userId,
        name:
          `${userRow?.first_name ?? ""} ${userRow?.last_name ?? ""}`.trim() ||
          auth.access.email ||
          "",
        email: userRow?.email ?? auth.access.email,
        roles: auth.access.roles,
        dbRoles: auth.access.dbRoles.map((role) => ({
          name: mapDbRoleToPublicRole(role) ?? role,
        })),
        address: address
          ? {
              id: address.id,
              fullAddress: formatFullAddress(address),
              neighborhood: address.neighborhood,
              phone: address.phone ?? "",
            }
          : null,
      },
    });
  } catch (error) {
    logger.error("auth.me_error", "[auth-error] error técnico en auth/me", {
      ...requestContext,
      route: "/api/auth/me",
      error,
    });
    return json(
      {
        success: false,
        error: "No pudimos obtener la sesión actual.",
      },
      { status: 500 },
    );
  }
}
