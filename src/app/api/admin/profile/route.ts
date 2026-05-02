import jwt from "jsonwebtoken";
import type { ResultSetHeader, RowDataPacket } from "mysql2/promise";
import { type NextRequest, NextResponse } from "next/server";

import pool from "@/lib/db";

type JwtPayload = {
  id: number;
};

type ProfileRow = RowDataPacket & {
  id: number;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  profile_image_url: string | null;
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
  const [rows] = await pool.query<RowDataPacket[]>(
    `
      SELECT 1
      FROM user_roles ur
      INNER JOIN roles r ON r.id = ur.role_id
      WHERE ur.user_id = ? AND r.name = 'admin_general'
      LIMIT 1
    `,
    [userId],
  );

  return rows.length > 0;
}

function normalizeNameParts(fullName: string) {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);

  return {
    firstName: parts[0] ?? "",
    lastName: parts.length > 1 ? parts.slice(1).join(" ") : null,
  };
}

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export async function GET(req: NextRequest) {
  try {
    const authUser = getAuthUser(req);

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

    const [rows] = await pool.query<ProfileRow[]>(
      `
        SELECT id, first_name, last_name, email, profile_image_url
        FROM users
        WHERE id = ?
        LIMIT 1
      `,
      [authUser.id],
    );

    if (!rows.length) {
      return NextResponse.json(
        { success: false, error: "Usuario no encontrado" },
        { status: 404 },
      );
    }

    const user = rows[0];

    return NextResponse.json({
      success: true,
      profile: {
        id: user.id,
        name: `${user.first_name ?? ""} ${user.last_name ?? ""}`.trim(),
        email: user.email ?? "",
        imageUrl: user.profile_image_url ?? null,
      },
    });
  } catch (error) {
    console.error("Error GET /api/admin/profile:", error);
    return NextResponse.json(
      {
        success: false,
        error: "No se pudo cargar el perfil.",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const authUser = getAuthUser(req);

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

    const body = await req.json();
    const name = String(body?.name ?? "").trim();
    const email = String(body?.email ?? "")
      .trim()
      .toLowerCase();

    if (!name) {
      return NextResponse.json(
        { success: false, error: "El nombre es obligatorio" },
        { status: 400 },
      );
    }

    if (!email || !isValidEmail(email)) {
      return NextResponse.json(
        { success: false, error: "El correo no es válido" },
        { status: 400 },
      );
    }

    const { firstName, lastName } = normalizeNameParts(name);

    if (!firstName) {
      return NextResponse.json(
        { success: false, error: "El nombre es obligatorio" },
        { status: 400 },
      );
    }

    await pool.query<ResultSetHeader>(
      `
        UPDATE users
        SET
          first_name = ?,
          last_name = ?,
          email = ?,
          updated_at = NOW()
        WHERE id = ?
      `,
      [firstName, lastName, email, authUser.id],
    );

    return NextResponse.json({
      success: true,
      message: "Perfil actualizado",
      profile: {
        id: authUser.id,
        name,
        email,
        imageUrl: null,
      },
    });
  } catch (error) {
    console.error("Error PATCH /api/admin/profile:", error);
    return NextResponse.json(
      {
        success: false,
        error: "No se pudo actualizar el perfil.",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}
