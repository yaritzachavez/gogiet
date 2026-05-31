import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import type { RowDataPacket } from "mysql2/promise";
import { type NextRequest, NextResponse } from "next/server";

import { updateAuthUserPassword } from "@/lib/auth-users";
import pool from "@/lib/db";
import { JWT_SECRET } from "@/lib/env";

type JwtPayload = {
  id: number;
};

function getAuthUser(req: NextRequest) {
  const auth = req.headers.get("authorization");
  const token = auth?.startsWith("Bearer ")
    ? auth.split(" ")[1]
    : req.cookies.get("authToken")?.value;

  if (!token) return null;

  try {
    return jwt.verify(token, JWT_SECRET) as JwtPayload;
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
    const newPassword = String(body?.newPassword ?? "");

    if (newPassword.trim().length < 6) {
      return NextResponse.json(
        {
          success: false,
          error: "La contraseña debe tener al menos 6 caracteres",
        },
        { status: 400 },
      );
    }

    const pepper = process.env.PASSWORD_PEPPER || "";
    const saltRounds = 10;
    const passwordHash = await bcrypt.hash(newPassword + pepper, saltRounds);

    await updateAuthUserPassword(authUser.id, passwordHash);

    return NextResponse.json({
      success: true,
      message: "Contraseña actualizada correctamente",
    });
  } catch (error) {
    console.error("Error PATCH /api/admin/password:", error);
    return NextResponse.json(
      {
        success: false,
        error: "No se pudo actualizar la contraseña.",
        debug: process.env.NODE_ENV === "production" ? undefined : (error instanceof Error ? error.message : String(error)),
      },
      { status: 500 },
    );
  }
}
