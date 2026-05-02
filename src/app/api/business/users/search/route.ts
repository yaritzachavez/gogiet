import type { RowDataPacket } from "mysql2/promise";
import { type NextRequest, NextResponse } from "next/server";

import { getAuthUser } from "@/lib/admin-security";
import { resolveBusinessAccess } from "@/lib/business-panel";
import pool, { logDbUsage } from "@/lib/db";

type SearchUserRow = RowDataPacket & {
  id: number;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
};

function toPositiveNumber(value: string | null) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

export async function GET(req: NextRequest) {
  try {
    const authUser = getAuthUser(req);

    if (!authUser?.token) {
      return NextResponse.json(
        { success: false, error: "Token faltante", users: [] },
        { status: 401 },
      );
    }

    if (!authUser?.user) {
      return NextResponse.json(
        { success: false, error: "Token inválido", users: [] },
        { status: 401 },
      );
    }

    const businessId = toPositiveNumber(
      req.nextUrl.searchParams.get("business_id"),
    );
    const query = String(req.nextUrl.searchParams.get("q") ?? "").trim();

    if (query.length < 2) {
      return NextResponse.json({ success: true, users: [] });
    }

    const access = await resolveBusinessAccess(authUser.user.id, businessId);
    logDbUsage("/api/business/users/search", {
      userId: access.userId,
      email: access.email,
      role: access.roles,
    });

    if (!access.businessId) {
      return NextResponse.json(
        { success: false, error: "No tienes negocio asignado", users: [] },
        { status: 403 },
      );
    }

    const likeQuery = `%${query}%`;
    const [rows] = await pool.query<SearchUserRow[]>(
      `
        SELECT
          u.id,
          u.first_name,
          u.last_name,
          u.email,
          u.phone
        FROM users u
        WHERE
          u.first_name LIKE ?
          OR u.last_name LIKE ?
          OR CONCAT_WS(' ', u.first_name, u.last_name) LIKE ?
          OR u.email LIKE ?
          OR u.phone LIKE ?
        ORDER BY u.first_name ASC, u.last_name ASC, u.id ASC
        LIMIT 10
      `,
      [likeQuery, likeQuery, likeQuery, likeQuery, likeQuery],
    );

    const users = rows
      .map((row) => ({
        id: Number(row.id),
        name: `${row.first_name ?? ""} ${row.last_name ?? ""}`.trim(),
        email: row.email ?? "",
        phone: row.phone ?? "",
      }))
      .filter(
        (user, index, self) =>
          index ===
          self.findIndex(
            (candidate) =>
              candidate.id === user.id && candidate.email === user.email,
          ),
      );

    return NextResponse.json({
      success: true,
      users,
    });
  } catch (error) {
    console.error("Error GET /api/business/users/search:", error);
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "No se pudieron buscar los usuarios.",
        users: [],
      },
      { status: 500 },
    );
  }
}
