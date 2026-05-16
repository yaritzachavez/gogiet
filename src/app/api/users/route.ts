import { type NextRequest, NextResponse } from "next/server";

import pool from "@/lib/db";
import { requirePermission } from "@/lib/permissions";

export async function GET(req: NextRequest) {
  try {
    const access = await requirePermission(
      req,
      "VIEW_ALL_USERS",
      undefined,
      "Solo el administrador general puede ver todos los usuarios.",
    );
    if (!access.ok) return access.response;

    const [rows] = await pool.query(
      `
        SELECT
          u.id,
          u.first_name,
          u.last_name,
          u.email,
          u.phone,
          u.created_at,
          u.updated_at,
          u.status_id,
          JSON_ARRAYAGG(
            CASE
              WHEN r.id IS NULL THEN NULL
              ELSE JSON_OBJECT('id', r.id, 'name', r.name)
            END
          ) AS roles
        FROM users u
        LEFT JOIN user_roles ur ON ur.user_id = u.id
        LEFT JOIN roles r ON r.id = ur.role_id
        GROUP BY u.id
        ORDER BY u.created_at DESC
      `,
    );

    return NextResponse.json({ success: true, users: rows });
  } catch (error) {
    console.error("Error GET /api/users:", error);
    return NextResponse.json(
      {
        error: "Error al obtener usuarios",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}
