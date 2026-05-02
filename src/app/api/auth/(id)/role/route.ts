import jwt from "jsonwebtoken";
import { NextResponse } from "next/server";

import pool from "@/lib/db";
import { mapDbRoleToPublicRole } from "@/lib/role-utils";

export async function GET(req: Request) {
  try {
    const auth = req.headers.get("authorization");
    if (!auth?.startsWith("Bearer ")) {
      return NextResponse.json(
        { error: "Token no proporcionado" },
        { status: 401 },
      );
    }

    const token = auth.split(" ")[1];
    const secret = process.env.JWT_SECRET || "gogi-dev-secret";

    const decoded = jwt.verify(token, secret) as { id: number };

    // Buscar roles del usuario
    const [rows] = await pool.query(
      `
      SELECT r.id, r.name
      FROM user_roles ur
      JOIN roles r ON ur.role_id = r.id
      WHERE ur.user_id = ?
      `,
      [decoded.id],
    );

    return NextResponse.json({
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
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      {
        error: "Error al obtener roles",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}
