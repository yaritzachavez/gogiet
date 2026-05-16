import type { RowDataPacket } from "mysql2/promise";
import { NextResponse } from "next/server";

import pool from "@/lib/db";

type ProductRow = RowDataPacket & {
  id: number;
  business_id: number | null;
  business_name: string | null;
  name: string;
  description_short: string | null;
  price: number | string | null;
  discount_price: number | string | null;
  image_url: string | null;
  thumbnail_url: string | null;
};

export async function GET(
  _req: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const productId = Number(id);

    if (!Number.isInteger(productId) || productId <= 0) {
      return NextResponse.json(
        { success: false, error: "ID de producto inválido" },
        { status: 400 },
      );
    }

    const [rows] = await pool.query<ProductRow[]>(
      `
        SELECT
          p.id,
          p.business_id,
          b.name AS business_name,
          p.name,
          p.description_short,
          p.price,
          p.discount_price,
          COALESCE(p.image_url, p.thumbnail_url) AS image_url,
          p.thumbnail_url
        FROM products p
        LEFT JOIN business b ON b.id = p.business_id
        WHERE p.id = ?
        LIMIT 1
      `,
      [productId],
    );

    const product = rows[0];

    if (!product) {
      return NextResponse.json(
        { success: false, error: "Producto no encontrado" },
        { status: 404 },
      );
    }

    return NextResponse.json({
      success: true,
      product: {
        id: product.id,
        business_id: product.business_id,
        name: product.name,
        description: product.description_short ?? "",
        description_short: product.description_short,
        description_long: null,
        price: Number(product.discount_price ?? product.price ?? 0),
        sale_price: product.discount_price
          ? Number(product.discount_price)
          : null,
        offer_price: null,
        discount_price: product.discount_price
          ? Number(product.discount_price)
          : null,
        image_url: product.image_url ?? product.thumbnail_url ?? null,
        imageUrl: product.image_url ?? product.thumbnail_url ?? null,
        image: product.image_url ?? product.thumbnail_url ?? null,
        photo_url: product.image_url ?? product.thumbnail_url ?? null,
      },
      business: {
        id: product.business_id,
        name: product.business_name,
      },
    });
  } catch (error) {
    console.error("Error GET /api/products/[id]:", error);
    return NextResponse.json(
      { success: false, error: "No se pudo cargar el producto" },
      { status: 500 },
    );
  }
}
