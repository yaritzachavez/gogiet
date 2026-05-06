import type { ResultSetHeader, RowDataPacket } from "mysql2/promise";
import { type NextRequest, NextResponse } from "next/server";

import { getAuthUser } from "@/lib/admin-security";
import pool from "@/lib/db";
import { ensureFavoritesTable } from "@/lib/favorites";

type FavoriteRow = RowDataPacket & {
  id: number;
  user_id: number;
  favorite_type: string;
  target_id: number;
  created_at: string;
};

function normalizeFavoriteType(value: unknown) {
  const type = String(value ?? "")
    .trim()
    .toLowerCase();

  return type === "business" || type === "negocio" ? "business" : "";
}

export async function GET(req: NextRequest) {
  try {
    const auth = getAuthUser(req);

    if (!auth?.user) {
      return NextResponse.json({ success: true, favorites: [] });
    }

    await ensureFavoritesTable();

    const type = normalizeFavoriteType(req.nextUrl.searchParams.get("type"));
    const filters: string[] = ["user_id = ?"];
    const values: Array<number | string> = [auth.user.id];

    if (type) {
      filters.push("favorite_type = ?");
      values.push(type);
    }

    const [rows] = await pool.query<FavoriteRow[]>(
      `
        SELECT id, user_id, favorite_type, target_id, created_at
        FROM favorites
        WHERE ${filters.join(" AND ")}
        ORDER BY created_at DESC
      `,
      values,
    );

    return NextResponse.json({
      success: true,
      favorites: rows.map((row) => ({
        id: Number(row.id),
        user_id: Number(row.user_id),
        favorite_type: row.favorite_type,
        target_id: Number(row.target_id),
        created_at: row.created_at,
      })),
    });
  } catch (error) {
    console.error("Error GET /api/favorites:", error);
    return NextResponse.json(
      { success: false, error: "No se pudieron cargar los favoritos." },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = getAuthUser(req);

    if (!auth?.token || !auth?.user) {
      return NextResponse.json(
        { success: false, error: "Inicia sesión para guardar favoritos." },
        { status: 401 },
      );
    }

    await ensureFavoritesTable();

    const body = (await req.json().catch(() => null)) as Record<
      string,
      unknown
    > | null;
    const favoriteType = normalizeFavoriteType(body?.favorite_type);
    const targetId = Number(body?.target_id);

    if (!favoriteType || !Number.isInteger(targetId) || targetId <= 0) {
      return NextResponse.json(
        {
          success: false,
          error: "favorite_type y target_id son obligatorios.",
        },
        { status: 400 },
      );
    }

    await pool.query<ResultSetHeader>(
      `
        INSERT IGNORE INTO favorites (
          user_id,
          favorite_type,
          target_id,
          created_at
        )
        VALUES (?, ?, ?, NOW())
      `,
      [auth.user.id, favoriteType, targetId],
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error POST /api/favorites:", error);
    return NextResponse.json(
      { success: false, error: "No se pudo guardar el favorito." },
      { status: 500 },
    );
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const auth = getAuthUser(req);

    if (!auth?.token || !auth?.user) {
      return NextResponse.json(
        { success: false, error: "Inicia sesión para editar favoritos." },
        { status: 401 },
      );
    }

    await ensureFavoritesTable();

    const body = (await req.json().catch(() => null)) as Record<
      string,
      unknown
    > | null;
    const favoriteType = normalizeFavoriteType(body?.favorite_type);
    const targetId = Number(body?.target_id);

    if (!favoriteType || !Number.isInteger(targetId) || targetId <= 0) {
      return NextResponse.json(
        {
          success: false,
          error: "favorite_type y target_id son obligatorios.",
        },
        { status: 400 },
      );
    }

    await pool.query<ResultSetHeader>(
      `
        DELETE FROM favorites
        WHERE user_id = ? AND favorite_type = ? AND target_id = ?
      `,
      [auth.user.id, favoriteType, targetId],
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error DELETE /api/favorites:", error);
    return NextResponse.json(
      { success: false, error: "No se pudo quitar el favorito." },
      { status: 500 },
    );
  }
}
