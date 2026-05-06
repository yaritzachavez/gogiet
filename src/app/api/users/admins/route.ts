import type { RowDataPacket } from "mysql2/promise";
import { type NextRequest, NextResponse } from "next/server";

import { getAuthUser, isAdminGeneral } from "@/lib/admin-security";
import pool from "@/lib/db";

type AdminUserRow = RowDataPacket & {
  id: number;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  status_id: number | null;
  role_name: string | null;
};

export async function GET(req: NextRequest) {
  try {
    const auth = getAuthUser(req);
    const token = auth?.token ?? null;
    const decodedUser = auth?.user ?? null;

    console.log("ADMIN API TOKEN:", token ? "EXISTE" : "NO EXISTE");
    console.log("ADMIN API USER:", decodedUser);

    if (!token || !decodedUser) {
      return NextResponse.json(
        {
          success: false,
          error: "Token inválido o faltante",
          admins: [],
        },
        { status: 401 },
      );
    }

    const canAccess = await isAdminGeneral(decodedUser.id);

    if (!canAccess) {
      return NextResponse.json(
        {
          success: false,
          error: "No autorizado para consultar administradores",
          admins: [],
        },
        { status: 403 },
      );
    }

    const [rows] = await pool.query<AdminUserRow[]>(
      `
        SELECT DISTINCT
          u.id,
          u.first_name,
          u.last_name,
          u.email,
          u.phone,
          u.status_id,
          r.name AS role_name
        FROM users u
        INNER JOIN user_roles ur ON ur.user_id = u.id
        INNER JOIN roles r ON r.id = ur.role_id
        WHERE LOWER(r.name) IN ('admin_general', 'admin', 'administrador', 'administrador_general')
        ORDER BY u.id DESC
      `,
    );

    const admins = rows.map((row) => ({
      id: Number(row.id),
      first_name: row.first_name ?? null,
      last_name: row.last_name ?? null,
      email: row.email ?? null,
      phone: row.phone ?? null,
      status_id: row.status_id === null ? null : Number(row.status_id),
      role_name: row.role_name ?? null,
    }));

    console.log("ADMIN API ADMINS COUNT:", admins.length);

    return NextResponse.json({
      success: true,
      admins,
    });
  } catch (error) {
    console.error("Error GET /api/users/admins:", error);
    return NextResponse.json(
      {
        success: false,
        error: "No pudimos cargar los administradores en este momento.",
        details: error instanceof Error ? error.message : String(error),
        admins: [],
      },
      { status: 500 },
    );
  }
}
