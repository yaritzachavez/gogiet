import jwt from "jsonwebtoken";
import { type NextRequest, NextResponse } from "next/server";

import pool from "@/lib/db";

type JwtPayload = {
  id: number;
  roles?: string[];
};

function getAuthUser(req: NextRequest) {
  const auth = req.headers.get("authorization");
  const token = auth?.startsWith("Bearer ")
    ? auth.split(" ")[1]
    : req.cookies.get("authToken")?.value;
  const secret = process.env.JWT_SECRET || "gogi-dev-secret";

  if (!token) return null;

  try {
    return jwt.verify(token, secret) as JwtPayload;
  } catch {
    return null;
  }
}

async function isAdminGeneral(userId: number) {
  const [rows] = await pool.query(
    `
      SELECT 1
      FROM user_roles ur
      INNER JOIN roles r ON r.id = ur.role_id
      WHERE ur.user_id = ? AND r.name = 'admin_general'
      LIMIT 1
    `,
    [userId],
  );

  return Array.isArray(rows) && rows.length > 0;
}

export async function GET(req: NextRequest) {
  try {
    const authUser = getAuthUser(req);

    if (!authUser) {
      return NextResponse.json(
        { error: "Token inválido o faltante" },
        { status: 401 },
      );
    }

    const allowed = await isAdminGeneral(authUser.id);

    if (!allowed) {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }

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
