import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import type { ResultSetHeader, RowDataPacket } from "mysql2/promise";
import { type NextRequest, NextResponse } from "next/server";

import { getAuthUser } from "@/lib/admin-security";
import { resolveBusinessAccess } from "@/lib/business-panel";
import pool from "@/lib/db";

type ProductLookupRow = RowDataPacket & {
  id: number;
  business_id: number;
};

type TableExistsRow = RowDataPacket & {
  table_name: string;
};

type ColumnExistsRow = RowDataPacket & {
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

export async function POST(req: NextRequest) {
  const connection = await pool.getConnection();
  let transactionStarted = false;

  try {
    const authUser = getAuthUser(req);

    if (!authUser?.token) {
      return NextResponse.json(
        { success: false, error: "Token faltante" },
        { status: 401 },
      );
    }

    if (!authUser?.user) {
      return NextResponse.json(
        { success: false, error: "Token inválido" },
        { status: 401 },
      );
    }

    const formData = await req.formData();
    const image = formData.get("image");
    const productId = Number(formData.get("product_id"));
    const requestedBusinessId = Number(formData.get("business_id"));

    if (!(image instanceof File)) {
      return NextResponse.json(
        { success: false, error: "Debes seleccionar una imagen." },
        { status: 400 },
      );
    }

    if (!Number.isInteger(productId) || productId <= 0) {
      return NextResponse.json(
        { success: false, error: "Producto inválido." },
        { status: 400 },
      );
    }

    const allowedMimeTypes = new Set([
      "image/jpeg",
      "image/jpg",
      "image/png",
      "image/webp",
    ]);

    if (!allowedMimeTypes.has(image.type)) {
      return NextResponse.json(
        {
          success: false,
          error: "Solo se permiten imágenes JPG, JPEG, PNG o WEBP.",
        },
        { status: 400 },
      );
    }

    if (image.size > 5 * 1024 * 1024) {
      return NextResponse.json(
        { success: false, error: "La imagen no debe superar 5 MB." },
        { status: 400 },
      );
    }

    const access = await resolveBusinessAccess(
      authUser.user.id,
      Number.isFinite(requestedBusinessId) ? requestedBusinessId : null,
    );

    if (!access.businessId) {
      return NextResponse.json(
        { success: false, error: "No tienes negocio asignado." },
        { status: 403 },
      );
    }

    const [productRows] = await connection.query<ProductLookupRow[]>(
      `
        SELECT id, business_id
        FROM products
        WHERE id = ? AND business_id = ?
        LIMIT 1
      `,
      [productId, access.businessId],
    );

    if (!productRows.length) {
      return NextResponse.json(
        { success: false, error: "Producto no encontrado para este negocio." },
        { status: 404 },
      );
    }

    const buffer = Buffer.from(await image.arrayBuffer());
    const extension = getFileExtension(image);
    const fileName = `product-${productId}-${randomUUID()}${extension}`;
    const uploadDir = path.join(process.cwd(), "public", "uploads", "products");
    const filePath = path.join(uploadDir, fileName);
    const publicUrl = `/uploads/products/${fileName}`;

    await mkdir(uploadDir, { recursive: true });
    await writeFile(filePath, buffer);

    const [tableRows] = await connection.query<TableExistsRow[]>(
      `
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = DATABASE()
          AND table_name = 'product_images'
      `,
    );

    const [productColumnRows] = await connection.query<ColumnExistsRow[]>(
      `
        SELECT column_name
        FROM information_schema.columns
        WHERE table_schema = DATABASE()
          AND table_name = 'products'
          AND column_name IN ('thumbnail_url', 'image_url')
      `,
    );

    const hasProductImagesTable = tableRows.length > 0;
    const productColumns = new Set(
      productColumnRows.map((row) => String(row.column_name).toLowerCase()),
    );

    if (
      !hasProductImagesTable &&
      !productColumns.has("thumbnail_url") &&
      !productColumns.has("image_url")
    ) {
      return NextResponse.json(
        {
          success: false,
          error:
            "No se encontró un campo válido para guardar la imagen del producto.",
        },
        { status: 500 },
      );
    }

    await connection.beginTransaction();
    transactionStarted = true;

    if (hasProductImagesTable) {
      await connection.query(
        `
          INSERT INTO product_images (product_id, image_url)
          VALUES (?, ?)
        `,
        [productId, publicUrl],
      );
    }

    if (productColumns.has("thumbnail_url")) {
      await connection.query<ResultSetHeader>(
        `
          UPDATE products
          SET thumbnail_url = ?, updated_at = NOW()
          WHERE id = ? AND business_id = ?
        `,
        [publicUrl, productId, access.businessId],
      );
    } else if (productColumns.has("image_url")) {
      await connection.query<ResultSetHeader>(
        `
          UPDATE products
          SET image_url = ?, updated_at = NOW()
          WHERE id = ? AND business_id = ?
        `,
        [publicUrl, productId, access.businessId],
      );
    }

    await connection.commit();

    return NextResponse.json({
      success: true,
      message: "Imagen guardada correctamente.",
      image_url: publicUrl,
      product_id: productId,
    });
  } catch (error) {
    if (transactionStarted) {
      await connection.rollback();
    }
    console.error("Error POST /api/business/products/upload-image:", error);
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "No se pudo guardar la imagen del producto.",
      },
      { status: 500 },
    );
  } finally {
    connection.release();
  }
}
