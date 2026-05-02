import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { type NextRequest, NextResponse } from "next/server";

import { getAuthUser } from "@/lib/admin-security";
import pool from "@/lib/db";
import {
  buildUserAvatarSelect,
  ensureUserAvatarColumn,
  getPreferredUserAvatarColumn,
} from "@/lib/user-avatar";

function getFileExtension(file: File) {
  const originalExtension = path.extname(file.name || "").toLowerCase();

  if (originalExtension) {
    return originalExtension;
  }

  switch (file.type) {
    case "image/png":
      return ".png";
    case "image/webp":
      return ".webp";
    default:
      return ".jpg";
  }
}

export async function GET(req: NextRequest) {
  try {
    const authUser = getAuthUser(req);

    if (!authUser?.user) {
      return NextResponse.json(
        { success: false, error: "Token inválido o faltante" },
        { status: 401 },
      );
    }

    const avatarColumns = await ensureUserAvatarColumn();
    const avatarSelect = buildUserAvatarSelect("u", avatarColumns);

    const [rows] = await pool.query(
      `
        SELECT
          u.id,
          TRIM(CONCAT_WS(' ', u.first_name, u.last_name)) AS name,
          ${avatarSelect}
        FROM users u
        WHERE u.id = ?
        LIMIT 1
      `,
      [authUser.user.id],
    );

    const user = (rows as Array<Record<string, unknown>>)[0];

    return NextResponse.json({
      success: true,
      user: user
        ? {
            id: Number(user.id ?? 0),
            name: String(user.name ?? "Usuario"),
            profile_image_url:
              user.profile_image_url === null ||
              user.profile_image_url === undefined
                ? null
                : String(user.profile_image_url),
          }
        : null,
    });
  } catch (error) {
    console.error("Error GET /api/users/avatar:", error);
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "No se pudo cargar la foto de perfil.",
      },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const authUser = getAuthUser(req);

    if (!authUser?.user) {
      return NextResponse.json(
        { success: false, error: "Token inválido o faltante" },
        { status: 401 },
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

    const allowedTypes = new Set([
      "image/jpeg",
      "image/jpg",
      "image/png",
      "image/webp",
    ]);

    if (!allowedTypes.has(file.type)) {
      return NextResponse.json(
        { success: false, error: "Solo se permiten JPG, PNG o WEBP" },
        { status: 400 },
      );
    }

    if (file.size > 5 * 1024 * 1024) {
      return NextResponse.json(
        { success: false, error: "La imagen no debe superar 5 MB" },
        { status: 400 },
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const extension = getFileExtension(file);
    const fileName = `avatar-${authUser.user.id}-${randomUUID()}${extension}`;
    const uploadDir = path.join(process.cwd(), "public", "uploads", "avatars");
    const filePath = path.join(uploadDir, fileName);
    const publicUrl = `/uploads/avatars/${fileName}`;

    await mkdir(uploadDir, { recursive: true });
    await writeFile(filePath, buffer);

    const avatarColumns = await ensureUserAvatarColumn();
    const targetAvatarColumn = getPreferredUserAvatarColumn(avatarColumns);

    await pool.query(
      `
        UPDATE users
        SET ${targetAvatarColumn} = ?, updated_at = NOW()
        WHERE id = ?
      `,
      [publicUrl, authUser.user.id],
    );

    return NextResponse.json({
      success: true,
      message: "Foto de perfil actualizada",
      profile_image_url: publicUrl,
    });
  } catch (error) {
    console.error("Error POST /api/users/avatar:", error);
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "No se pudo actualizar la foto de perfil.",
      },
      { status: 500 },
    );
  }
}
