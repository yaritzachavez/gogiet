import type { RowDataPacket } from "mysql2/promise";
import { NextResponse } from "next/server";

import pool from "@/lib/db";

type FilterUserRow = RowDataPacket & {
  id: number;
  first_name: string | null;
  last_name: string | null;
  email: string;
  status_id: number | null;
  created_at: Date | string;
  updated_at: Date | string;
};

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const onlyActive = searchParams.get("onlyActive") === "true";
    const role = searchParams.get("role");
    const query = searchParams.get("q");

    let baseQuery = `
    SELECT 
        id,
        first_name,
        last_name,
        email,
        status_id,
        created_at,
        updated_at
    FROM users
    WHERE 1 = 1
    `;
    const params: Array<string | number> = [];

    if (onlyActive) {
      baseQuery += " AND status_id = 1";
    }

    if (role) {
      baseQuery +=
        " AND id IN (SELECT user_id FROM user_roles WHERE role_id = ?)";
      params.push(role);
    }

    if (query) {
      baseQuery +=
        " AND (first_name LIKE ? OR last_name LIKE ? OR email LIKE ?)";
      params.push(`%${query}%`, `%${query}%`, `%${query}%`);
    }

    baseQuery += " ORDER BY first_name ASC";

    const [rows] = await pool.query<FilterUserRow[]>(baseQuery, params);

    return NextResponse.json({ users: rows });
  } catch (error) {
    console.error("❌ Error en /api/users/filter:", error);
    return NextResponse.json(
      { error: "Error interno del servidor" },
      { status: 500 },
    );
  }
}
