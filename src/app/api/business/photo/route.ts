import type { ResultSetHeader, RowDataPacket } from "mysql2/promise";
import { type NextRequest, NextResponse } from "next/server";

import { getAuthUser } from "@/lib/admin-security";
import { resolveBusinessAccess } from "@/lib/business-panel";
import { cloudinary } from "@/lib/cloudinary";
import pool from "@/lib/db";

export const runtime = "nodejs";

type BusinessImageColumnRow = RowDataPacket & {
  column_name: string;
};

function uploadToCloudinary(buffer: Buffer, businessId: number) {
  return new Promise<{
    secure_url: string;
    public_id: string;
  }>((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder: `gogi-eats/business/${businessId}`,
        resource_type: "image",
      },
      (error, result) => {
        if (error || !result) {
          reject(error ?? new Error("No se pudo subir la imagen."));
          return;
        }

        resolve({
          secure_url: result.secure_url,
          public_id: result.public_id,
        });
      },
    );

    stream.end(buffer);
  });
}

async function getBusinessImageColumn() {
  const [rows] = await pool.query<BusinessImageColumnRow[]>(
    `
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = DATABASE()
        AND table_name = 'business'
        AND column_name IN ('logo_url', 'image_url', 'photo_url', 'logo')
    `,
  );

  const availableColumns = new Set(
    rows.map((row) => String(row.column_name).toLowerCase()),
  );

  const priority = ["logo_url", "image_url", "photo_url", "logo"];

  return priority.find((column) => availableColumns.has(column)) ?? null;
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

    const targetColumn = await getBusinessImageColumn();

    if (!targetColumn) {
      return NextResponse.json(
        {
          success: false,
          error:
            "La tabla business no tiene una columna de imagen compatible.",
        },
        { status: 500 },
      );
    }

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
          SET ${targetColumn} = NULL, updated_at = NOW()
          WHERE id = ?
        `,
        [access.businessId],
      );

      return NextResponse.json({
        success: true,
        imageUrl: null,
        avatar_url: null,
      });
    }

    const file = formData.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json(
        { success: false, error: "No se recibió imagen" },
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

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    const result = await uploadToCloudinary(buffer, access.businessId);

    await pool.query<ResultSetHeader>(
      `
        UPDATE business
        SET ${targetColumn} = ?, updated_at = NOW()
        WHERE id = ?
      `,
      [result.secure_url, access.businessId],
    );

    return NextResponse.json({
      success: true,
      imageUrl: result.secure_url,
      publicId: result.public_id,
      avatar_url: result.secure_url,
    });
  } catch (error) {
    console.error("Error subiendo foto del negocio:", error);
    return NextResponse.json(
      { success: false, error: "Error subiendo foto del negocio" },
      { status: 500 },
    );
  }
}
