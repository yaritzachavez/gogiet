import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import jwt from "jsonwebtoken";
import type { ResultSetHeader, RowDataPacket } from "mysql2/promise";
import { type NextRequest, NextResponse } from "next/server";

import pool from "@/lib/db";
import {
  ensureUserAvatarColumn,
  getPreferredUserAvatarColumn,
} from "@/lib/user-avatar";

type JwtPayload = {
  id: number;
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

function getFileExtension(file: File) {
  const originalExtension = path.extname(file.name || "").toLowerCase();
  if (originalExtension) return originalExtension;

  switch (file.type) {
    case "image/png":
      return ".png";
    case "image/webp":
      return ".webp";
    case "image/gif":
      return ".gif";
    default:
      return ".jpg";
  }
}

export async function POST(req: NextRequest) {
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

    const formData = await req.formData();
    const file = formData.get("avatar");

    if (!(file instanceof File)) {
      return NextResponse.json(
        { success: false, error: "Debes seleccionar una imagen" },
        { status: 400 },
      );
    }

    if (!file.type.startsWith("image/")) {
      return NextResponse.json(
        { success: false, error: "El archivo debe ser una imagen" },
        { status: 400 },
      );
    }

    if (file.size > 5 * 1024 * 1024) {
      return NextResponse.json(
        { success: false, error: "La imagen no debe superar 5MB" },
        { status: 400 },
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const extension = getFileExtension(file);
    const fileName = `admin-avatar-${authUser.id}-${randomUUID()}${extension}`;
    const uploadDir = path.join(process.cwd(), "public", "uploads", "avatars");
    const filePath = path.join(uploadDir, fileName);
    const publicUrl = `/uploads/avatars/${fileName}`;

    await mkdir(uploadDir, { recursive: true });
    await writeFile(filePath, buffer);

    const avatarColumns = await ensureUserAvatarColumn();
    const targetAvatarColumn = getPreferredUserAvatarColumn(avatarColumns);

    await pool.query<ResultSetHeader>(
      `
        UPDATE users
        SET ${targetAvatarColumn} = ?, updated_at = NOW()
        WHERE id = ?
      `,
      [publicUrl, authUser.id],
    );

    return NextResponse.json({
      success: true,
      message: "Foto actualizada",
      imageUrl: publicUrl,
    });
  } catch (error) {
    console.error("Error POST /api/admin/upload-avatar:", error);
    return NextResponse.json(
      {
        success: false,
        error: "No se pudo actualizar la foto.",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}
