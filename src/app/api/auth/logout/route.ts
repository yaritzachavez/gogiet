import { NextResponse } from "next/server";

import { getAuthUser } from "@/lib/admin-security";
import pool from "@/lib/db";
import { ensureAuthSecuritySchema } from "@/lib/auth-security";
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
      await ensureAuthSecuritySchema();
      await pool.query(
        `
          UPDATE user_sessions
          SET status = 'revoked', updated_at = NOW()
          WHERE token = ? AND status = 'active'
        `,
        [auth.token],
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
  } catch (error) {
    return json(
      {
        success: false,
        error: "No se pudo cerrar la sesión correctamente.",
      },
      { status: 500 },
    );
  }
}
