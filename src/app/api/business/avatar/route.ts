import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import type { ResultSetHeader, RowDataPacket } from "mysql2/promise";
import { type NextRequest, NextResponse } from "next/server";

import { getAuthUser } from "@/lib/admin-security";
import { resolveBusinessAccess } from "@/lib/business-panel";
import pool from "@/lib/db";

type BusinessAvatarColumnRow = RowDataPacket & {
  column_name: string;
};

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

async function ensureBusinessAvatarColumn() {
  const [rows] = await pool.query<BusinessAvatarColumnRow[]>(
    `
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = DATABASE()
        AND table_name = 'business'
        AND column_name = 'avatar_url'
    `,
  );

  if (!rows.length) {
    await pool.query(
      `
        ALTER TABLE business
        ADD COLUMN avatar_url VARCHAR(255) NULL
      `,
    );
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const authUser = getAuthUser(req);

    if (!authUser?.user) {
      return NextResponse.json(
        { success: false, error: "Token inválido o faltante" },
        { status: 401 },
      );
    }

    await ensureBusinessAvatarColumn();

    const formData = await req.formData();
    const requestedBusinessId = Number(formData.get("business_id"));
    const remove = String(formData.get("remove") ?? "0") === "1";

    const access = await resolveBusinessAccess(
      authUser.user.id,
      Number.isFinite(requestedBusinessId) ? requestedBusinessId : null,
    );

    if (!access.businessId) {
      return NextResponse.json(
        { success: false, error: "No tienes un negocio asignado" },
        { status: 403 },
      );
    }

    if (remove) {
      await pool.query<ResultSetHeader>(
        `
          UPDATE business
          SET avatar_url = NULL, updated_at = NOW()
          WHERE id = ?
        `,
        [access.businessId],
      );

      return NextResponse.json({
        success: true,
        message: "Imagen eliminada correctamente",
        avatar_url: null,
      });
    }

    const image = formData.get("avatar");

    if (!(image instanceof File)) {
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

    if (!allowedTypes.has(image.type)) {
      return NextResponse.json(
        { success: false, error: "Solo se permiten JPG, PNG o WEBP" },
        { status: 400 },
      );
    }

    if (image.size > 5 * 1024 * 1024) {
      return NextResponse.json(
        { success: false, error: "La imagen no debe superar 5 MB" },
        { status: 400 },
      );
    }

    const buffer = Buffer.from(await image.arrayBuffer());
    const extension = getFileExtension(image);
    const fileName = `business-${access.businessId}-${randomUUID()}${extension}`;
    const uploadDir = path.join(process.cwd(), "public", "uploads", "business");
    const filePath = path.join(uploadDir, fileName);
    const publicUrl = `/uploads/business/${fileName}`;

    await mkdir(uploadDir, { recursive: true });
    await writeFile(filePath, buffer);

    await pool.query<ResultSetHeader>(
      `
        UPDATE business
        SET avatar_url = ?, updated_at = NOW()
        WHERE id = ?
      `,
      [publicUrl, access.businessId],
    );

    return NextResponse.json({
      success: true,
      message: "Imagen actualizada correctamente",
      avatar_url: publicUrl,
    });
  } catch (error) {
    console.error("Error PATCH /api/business/avatar:", error);
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "No se pudo actualizar la foto del negocio.",
      },
      { status: 500 },
    );
  }
}
