import { NextResponse } from "next/server";

import { getAuthUser } from "@/lib/admin-security";
import { isSessionTokenActive, touchSessionToken } from "@/lib/auth-security";
import pool from "@/lib/db";
import { getExistingTables } from "@/lib/db-schema";
import { mapDbRoleToPublicRole } from "@/lib/role-utils";
import { handleCorsPreflight, withCors } from "@/lib/server/cors";

export function OPTIONS(req: Request) {
  return handleCorsPreflight(req);
}

export async function GET(req: Request) {
  try {
    const authUser = getAuthUser(req);

    if (!authUser.token || !authUser.user) {
      return withCors(
        req,
        NextResponse.json(
          {
            success: false,
            error: "Token inválido o faltante.",
            roles: [],
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
            error: "Tu sesión ya no está activa.",
            roles: [],
          },
          { status: 401 },
        ),
      );
    }

    await touchSessionToken(authUser.token);

    const existingTables = await getExistingTables(["user_roles", "roles"]);

    if (!existingTables.has("user_roles") || !existingTables.has("roles")) {
      return withCors(
        req,
        NextResponse.json({
          success: true,
          roles: [],
        }),
      );
    }

    const [rows] = await pool.query(
      `
      SELECT r.id, r.name
      FROM user_roles ur
      JOIN roles r ON ur.role_id = r.id
      WHERE ur.user_id = ?
      `,
      [authUser.user.id],
    );

    return withCors(
      req,
      NextResponse.json({
        success: true,
        roles: Array.isArray(rows)
          ? rows.map((row) => {
              const roleRow = row as { id?: number; name?: string };
              return {
                id: roleRow.id,
                name:
                  mapDbRoleToPublicRole(String(roleRow.name ?? "")) ??
                  String(roleRow.name ?? ""),
              };
            })
          : [],
      }),
    );
  } catch (error) {
    console.error(error);
    return withCors(
      req,
      NextResponse.json(
        {
          success: false,
          error: "Error al obtener roles",
          details: error instanceof Error ? error.message : String(error),
          roles: [],
        },
        { status: 500 },
      ),
    );
  }
}
