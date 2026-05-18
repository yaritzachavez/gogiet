import { NextResponse } from "next/server";

import {
  getAuthUser,
  getPersistedSessionTokenValue,
  getUserSessionsSchema,
} from "@/lib/admin-security";
import pool from "@/lib/db";
import { handleCorsPreflight, withCors } from "@/lib/server/cors";

export function OPTIONS(req: Request) {
  return handleCorsPreflight(req);
}

export async function POST(req: Request) {
  const json = (body: unknown, init?: ResponseInit) =>
    withCors(req, NextResponse.json(body, init));

  try {
    const auth = getAuthUser(req);

    if (auth.token) {
      const sessionSchema = await getUserSessionsSchema();
      const persistedToken = getPersistedSessionTokenValue(
        auth.token,
        sessionSchema,
      );
      const updates = ["status = 'revoked'"];

      if (sessionSchema.hasRevokedAt) {
        updates.push("revoked_at = COALESCE(revoked_at, NOW())");
      }

      if (sessionSchema.hasUpdatedAt) {
        updates.push("updated_at = NOW()");
      }

      const where = [`${sessionSchema.tokenColumn} = ?`];

      if (sessionSchema.hasStatus) {
        where.push("status = 'active'");
      }

      if (sessionSchema.hasRevokedAt) {
        where.push("revoked_at IS NULL");
      }

      await pool.query(
        `
          UPDATE user_sessions
          SET ${updates.join(", ")}
          WHERE ${where.join(" AND ")}
        `,
        [persistedToken],
      );
    }

    const response = NextResponse.json({
      success: true,
      message: "Sesión cerrada correctamente.",
    });

    response.cookies.set("authToken", "", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 0,
    });

    return withCors(req, response);
  } catch (_error) {
    return json(
      {
        success: false,
        error: "No se pudo cerrar la sesión correctamente.",
      },
      { status: 500 },
    );
  }
}
