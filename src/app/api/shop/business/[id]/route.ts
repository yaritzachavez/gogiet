export const dynamic = "force-dynamic";
export const revalidate = 0;

import type { RowDataPacket } from "mysql2/promise";
import { NextResponse } from "next/server";
import pool from "@/lib/db";

type BusinessRow = RowDataPacket & {
  id: number;
  name: string;
  avatar_url: string | null;
  business_category_id: number | null;
  category_name: string | null;
  city: string | null;
  district: string | null;
  address: string | null;
  address_notes: string | null;
  phone: string | null;
  email: string | null;
  logo_url: string | null;
  cover_image_url: string | null;
  min_order_amount: number | string | null;
  estimated_delivery_minutes: number | null;
  rating_average: number | string | null;
  is_open_now: number | boolean | null;
  status_id: number;
  created_at: string;
  updated_at: string;
  description_long: string | null;
  slogan: string | null;
  specialties: string | null;
  accepts_pickup: number | boolean | null;
  accepts_delivery: number | boolean | null;
  whatsapp_phone: string | null;
};

type ProductRow = RowDataPacket & {
  id: number;
  business_id: number;
  sku: string | null;
  name: string;
  description_short: string | null;
  product_category_id: number | null;
  category_name: string | null;
  price: number | string;
  discount_price: number | string | null;
  currency: string | null;
  sale_format: string | null;
  price_per_unit: number | string | null;
  image_url: string | null;
  thumbnail_url: string | null;
  stock_average: number | string | null;
  stock_danger: number | string | null;
  is_stock_available: number | boolean | null;
  max_per_order: number | null;
  min_per_order: number | null;
  status_id: number;
  created_at: string;
  updated_at: string;
};

export async function GET(
  _req: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;

    if (!id) {
      return NextResponse.json(
        { error: "Falta el ID del negocio" },
        { status: 400 },
      );
    }

    const [businessRows] = await pool.query<BusinessRow[]>(
      `
        SELECT
          b.id,
          b.name,
          b.avatar_url,
          bcm.category_id AS business_category_id,
          bc.name AS category_name,
          b.city,
          b.district,
          b.address,
          b.address_notes,
          b.phone,
          b.email,
          b.logo_url,
          b.cover_image_url,
          b.min_order_amount,
          b.estimated_delivery_minutes,
          b.rating_average,
          b.is_open AS is_open_now,
          b.status_id,
          b.created_at,
          b.updated_at,
          bd.description_long,
          bd.slogan,
          bd.specialties,
          bd.accepts_pickup,
          bd.accepts_delivery,
          bd.whatsapp_phone
        FROM business b
        LEFT JOIN business_category_map bcm ON bcm.business_id = b.id
        LEFT JOIN business_categories bc ON bc.id = bcm.category_id
        LEFT JOIN business_details bd ON bd.business_id = b.id
        WHERE b.id = ? AND b.status_id = 1
        LIMIT 1
      `,
      [id],
    );

    if (businessRows.length === 0) {
      return NextResponse.json(
        { error: "Negocio no encontrado" },
        { status: 404 },
      );
    }

    const business = businessRows[0];

    const [tableRows] = await pool.query<RowDataPacket[]>(
      `
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = DATABASE()
          AND table_name = 'product_images'
      `,
    );

    const [productColumnRows] = await pool.query<RowDataPacket[]>(
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

    const productImageJoin = hasProductImagesTable
      ? `
        LEFT JOIN (
          SELECT product_id, MAX(image_url) AS image_url
          FROM product_images
          GROUP BY product_id
        ) pi ON pi.product_id = p.id
      `
      : "";

    const imageColumns = [
      hasProductImagesTable ? "pi.image_url" : null,
      productColumns.has("image_url") ? "p.image_url" : null,
      productColumns.has("thumbnail_url") ? "p.thumbnail_url" : null,
    ].filter(Boolean);

    const imageSelect =
      imageColumns.length > 0
        ? `COALESCE(${imageColumns.join(", ")}) AS image_url,`
        : "NULL AS image_url,";

    const [productRows] = await pool.query<ProductRow[]>(
      `
        SELECT
          p.id,
          p.business_id,
          p.sku,
          p.name,
          p.description_short,
          pcm.category_id AS product_category_id,
          pc.name AS category_name,
          p.price,
          p.discount_price,
          p.currency,
          p.sale_format,
          p.price_per_unit,
          ${imageSelect}
          ${
            productColumns.has("thumbnail_url")
              ? "p.thumbnail_url,"
              : "NULL AS thumbnail_url,"
          }
          p.stock_average,
          p.stock_danger,
          p.is_stock_available,
          p.max_per_order,
          p.min_per_order,
          p.status_id,
          p.created_at,
          p.updated_at
        FROM products p
        LEFT JOIN product_category_map pcm ON pcm.product_id = p.id
        LEFT JOIN product_categories pc ON pc.id = pcm.category_id
        ${productImageJoin}
        WHERE p.business_id = ? AND p.status_id = 1
        ORDER BY pc.name, p.name
      `,
      [id],
    );

    const products = productRows.map((row) => ({
      ...row,
      price: Number(row.price),
      discount_price: row.discount_price ? Number(row.discount_price) : null,
      price_per_unit: row.price_per_unit ? Number(row.price_per_unit) : null,
      is_stock_available: Boolean(row.is_stock_available),
    }));

    const categoriesMap = new Map();
    products.forEach((product) => {
      const categoryId = product.product_category_id ?? "uncategorized";

      if (!categoriesMap.has(categoryId)) {
        categoriesMap.set(categoryId, {
          id: categoryId,
          name: product.category_name ?? "Sin categoría",
          products: [],
        });
      }

      categoriesMap.get(categoryId).products.push(product);
    });

    const categories = Array.from(categoriesMap.values());

    return NextResponse.json(
      {
        message: "OK",
        business: {
          ...business,
          is_open_now: Boolean(business.is_open_now),
          accepts_pickup: Boolean(business.accepts_pickup),
          accepts_delivery: Boolean(business.accepts_delivery),
        },
        products,
        categories,
        stats: {
          total_products: products.length,
          total_categories: categories.length,
          has_products: products.length > 0,
        },
      },
      { status: 200 },
    );
  } catch (error) {
    console.error("Error al obtener negocio:", error);
    return NextResponse.json(
      { error: "Error interno", details: (error as Error).message },
      { status: 500 },
    );
  }
}
