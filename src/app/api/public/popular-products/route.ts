import type { RowDataPacket } from "mysql2/promise";
import { NextResponse } from "next/server";

import pool, { logDbUsage } from "@/lib/db";

type ProductRow = RowDataPacket & {
  id: number;
  name: string;
  description_short: string | null;
  price: number | string;
  discount_price: number | string | null;
  currency: string | null;
  thumbnail_url: string | null;
  image_url: string | null;
  business_id: number;
  business_name: string;
  business_logo_url: string | null;
  category_name: string | null;
  created_at: string;
};

export async function GET() {
  try {
    logDbUsage("/api/public/popular-products");

    const [rows] = await pool.query<ProductRow[]>(
      `
        SELECT
          p.id,
          p.name,
          p.description_short,
          p.price,
          p.discount_price,
          p.currency,
          p.thumbnail_url,
          (
            SELECT pi.image_url
            FROM product_images pi
            WHERE pi.product_id = p.id
            ORDER BY pi.is_primary DESC, pi.sort_order ASC, pi.id ASC
            LIMIT 1
          ) AS image_url,
          b.id AS business_id,
          b.name AS business_name,
          b.logo_url AS business_logo_url,
          MIN(pc.name) AS category_name,
          p.created_at
        FROM products p
        INNER JOIN businesses b ON b.id = p.business_id
        LEFT JOIN status_catalog psc ON psc.id = p.status_id
        LEFT JOIN status_catalog bsc ON bsc.id = b.status_id
        LEFT JOIN product_category_map pcm ON pcm.product_id = p.id
        LEFT JOIN product_categories pc ON pc.id = pcm.category_id
        WHERE (
          p.status_id = 1
          OR LOWER(COALESCE(psc.name, '')) IN ('active', 'activo')
        )
          AND (
            b.status_id = 1
            OR LOWER(COALESCE(bsc.name, '')) IN ('active', 'activo')
          )
        GROUP BY p.id
        ORDER BY p.created_at DESC, p.id DESC
        LIMIT 10
      `,
    );

    const products = rows.map((row) => ({
      id: row.id,
      name: row.name,
      description: row.description_short,
      price: Number(row.discount_price ?? row.price ?? 0),
      originalPrice: row.discount_price != null ? Number(row.price ?? 0) : null,
      currency: row.currency ?? "MXN",
      imageUrl: row.image_url ?? row.thumbnail_url ?? row.business_logo_url,
      businessId: row.business_id,
      businessName: row.business_name,
      category: row.category_name ?? "Popular",
      createdAt: row.created_at,
    }));

    return NextResponse.json(
      {
        success: true,
        products,
      },
      { status: 200 },
    );
  } catch (error) {
    const details = error instanceof Error ? error.message : String(error);

    console.error("ERROR GET /api/public/popular-products:", {
      details,
      stack: error instanceof Error ? error.stack : undefined,
      error,
    });

    return NextResponse.json(
      {
        success: false,
        error: "No se pudieron cargar los productos populares",
        details,
        debug: null,
      },
      { status: 500 },
    );
  }
}
