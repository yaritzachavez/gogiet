import type { RowDataPacket } from "mysql2/promise";
import { type NextRequest, NextResponse } from "next/server";

import { getAuthUser, isAdminGeneral } from "@/lib/admin-security";
import pool from "@/lib/db";

type SearchUserRow = RowDataPacket & {
  id: number;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
};

function parsePositiveNumber(value: string | null) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

export async function GET(req: NextRequest) {
  try {
    const { user: authUser } = getAuthUser(req);

    if (!authUser) {
      return NextResponse.json(
        { success: false, error: "Token inválido o faltante" },
        { status: 401 },
      );
    }

    if (!(await isAdminGeneral(authUser.id))) {
      return NextResponse.json(
        { success: false, error: "No autorizado" },
        { status: 403 },
      );
    }

    const searchId = parsePositiveNumber(req.nextUrl.searchParams.get("id"));
    const query = String(req.nextUrl.searchParams.get("q") ?? "").trim();

    if (!searchId && query.length < 2) {
      return NextResponse.json({
        success: true,
        users: [],
      });
    }

    let rows: SearchUserRow[] = [];

    if (searchId) {
      const [result] = await pool.query<SearchUserRow[]>(
        `
          SELECT id, first_name, last_name, email, phone
          FROM users
          WHERE id = ?
          LIMIT 1
        `,
        [searchId],
      );

      rows = result;
    } else {
      const likeQuery = `%${query}%`;
      const [result] = await pool.query<SearchUserRow[]>(
        `
          SELECT id, first_name, last_name, email, phone
          FROM users
          WHERE
            first_name LIKE ?
            OR last_name LIKE ?
            OR CONCAT_WS(' ', first_name, last_name) LIKE ?
            OR email LIKE ?
            OR phone LIKE ?
          ORDER BY first_name ASC, last_name ASC, id ASC
          LIMIT 10
        `,
        [likeQuery, likeQuery, likeQuery, likeQuery, likeQuery],
      );

      rows = result;
    }

    return NextResponse.json({
      success: true,
      users: rows.map((row) => ({
        id: Number(row.id),
        name: `${row.first_name ?? ""} ${row.last_name ?? ""}`.trim(),
        email: row.email ?? "",
        phone: row.phone ?? "",
      })),
    });
  } catch (error) {
    console.error("Error GET /api/admin/users/search:", error);
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "No se pudieron buscar los usuarios.",
      },
      { status: 500 },
    );
  }
}
