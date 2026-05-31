import { type NextRequest, NextResponse } from "next/server";
import { getActiveAuthStatusId } from "@/lib/auth-users";
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
    const activeStatusId = await getActiveAuthStatusId();

    const [rows] = await pool.query(
      `
        SELECT
          u.id,
          u.first_name,
          u.last_name,
          u.email,
          u.phone,
          u.email_verified AS is_verified,
          NULL AS email_verified_at,
          u.created_at,
          u.updated_at,
          u.status_id,
          sc.name AS status,
          CASE
            WHEN u.status_id = ? THEN 1
            WHEN UPPER(TRIM(COALESCE(sc.name, ''))) IN ('ACTIVE', 'ACTIVO') THEN 1
            ELSE 0
          END AS is_active,
          JSON_ARRAYAGG(
            CASE
              WHEN r.id IS NULL THEN NULL
              ELSE JSON_OBJECT('id', r.id, 'name', r.name)
            END
          ) AS roles
        FROM users u
        LEFT JOIN status_catalog sc ON sc.id = u.status_id
        LEFT JOIN user_roles ur ON ur.user_id = u.id
        LEFT JOIN roles r ON r.id = ur.role_id
        GROUP BY u.id
        ORDER BY u.created_at DESC
      `,
      [activeStatusId],
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
