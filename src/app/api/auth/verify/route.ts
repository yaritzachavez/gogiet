import { NextResponse } from "next/server";

import { getAuthUser } from "@/lib/admin-security";
import { isSessionTokenActive, touchSessionToken } from "@/lib/auth-security";
import { handleCorsPreflight, withCors } from "@/lib/server/cors";

export function OPTIONS(req: Request) {
  return handleCorsPreflight(req);
}

export async function GET(req: Request) {
  const authUser = getAuthUser(req);

  if (!authUser.token) {
    return withCors(
      req,
      NextResponse.json(
        {
          success: false,
          valid: false,
          error: "Token no proporcionado.",
        },
        { status: 401 },
      ),
    );
  }

  if (!authUser.user) {
    return withCors(
      req,
      NextResponse.json(
        {
          success: false,
          valid: false,
          error: "Token inválido o expirado.",
        },
        { status: 401 },
      ),
    );
  }

  const activeSession = await isSessionTokenActive(authUser.token);

  if (!activeSession) {
    return withCors(
      req,
      NextResponse.json(
        {
          success: false,
          valid: false,
          error: "Tu sesión ya no está activa.",
        },
        { status: 401 },
      ),
    );
  }

  await touchSessionToken(authUser.token);

  return withCors(
    req,
    NextResponse.json({
      success: true,
      valid: true,
      user: authUser.user,
    }),
  );
}
