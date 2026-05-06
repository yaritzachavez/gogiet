import { NextResponse } from "next/server";
import { ensureBusinessLogoColumn } from "@/lib/business-logo";
import pool, { logDbUsage } from "@/lib/db";

type StoreRow = {
  id: number;
  name: string;
  city: string | null;
  district: string | null;
  address: string;
  phone: string | null;
  email: string | null;
  avatar_url: string | null;
  logo_url: string | null;
  cover_image_url: string | null;
  min_order_amount: number | string | null;
  estimated_delivery_minutes: number | null;
  rating_average: number | string | null;
  is_open_now: number | boolean;
  status_id: number;
  status_name: string | null;
  created_at: string;
  updated_at: string;
  categories: string | null;
  product_names: string | null;
  product_categories: string | null;
};

export async function GET(req: Request) {
  try {
    await ensureBusinessLogoColumn();
    logDbUsage("/api/stores");
    const url = new URL(req.url);
    const search = String(url.searchParams.get("q") ?? "").trim();
    const searchLike = search ? `%${search}%` : null;
    const [rows] = await pool.query(
      `
      SELECT
        b.id,
        b.name,
        b.city,
        b.district,
        b.address,
        b.phone,
        b.email,
        b.logo_url AS avatar_url,
        b.logo_url,
        b.cover_image_url,
        b.min_order_amount,
        b.estimated_delivery_minutes,
        b.rating_average,
        b.is_open AS is_open_now,
        b.status_id,
        sc.name AS status_name,
        b.created_at,
        b.updated_at,
        GROUP_CONCAT(DISTINCT bc.name ORDER BY bc.name SEPARATOR ', ') AS categories,
        GROUP_CONCAT(DISTINCT p.name ORDER BY p.name SEPARATOR ', ') AS product_names,
        GROUP_CONCAT(DISTINCT pc.name ORDER BY pc.name SEPARATOR ', ') AS product_categories
      FROM business b
      LEFT JOIN status_catalog sc ON sc.id = b.status_id
      LEFT JOIN business_category_map bcm ON bcm.business_id = b.id
      LEFT JOIN business_categories bc ON bc.id = bcm.category_id
      LEFT JOIN products p ON p.business_id = b.id
      LEFT JOIN status_catalog psc ON psc.id = p.status_id
      LEFT JOIN product_category_map pcm ON pcm.product_id = p.id
      LEFT JOIN product_categories pc ON pc.id = pcm.category_id
      WHERE (
        b.status_id = 1
        OR LOWER(COALESCE(sc.name, '')) IN ('activo', 'active')
      )
        AND (
          p.id IS NULL
          OR p.status_id = 1
          OR LOWER(COALESCE(psc.name, '')) IN ('activo', 'active')
        )
        ${
          searchLike
            ? `
        AND (
          b.name LIKE ?
          OR b.city LIKE ?
          OR bc.name LIKE ?
          OR p.name LIKE ?
          OR pc.name LIKE ?
        )`
            : ""
        }
      GROUP BY b.id
      ORDER BY b.is_open DESC, b.id DESC
    `,
      searchLike
        ? [searchLike, searchLike, searchLike, searchLike, searchLike]
        : [],
    );

    const stores = (rows as StoreRow[]).map((store) => ({
      id: store.id,
      name: store.name,
      city: store.city,
      district: store.district,
      address: store.address,
      phone: store.phone,
      email: store.email,
      avatar_url: store.logo_url,
      logo_url: store.logo_url,
      cover_image_url: store.cover_image_url,
      min_order_amount: store.min_order_amount,
      estimated_delivery_minutes: store.estimated_delivery_minutes,
      rating_average: Number(store.rating_average ?? 0),
      is_open_now: Boolean(store.is_open_now),
      status_id: store.status_id,
      created_at: store.created_at,
      updated_at: store.updated_at,
      category_name: store.categories?.split(", ")[0] ?? "General",
      categories: store.categories
        ? String(store.categories).split(", ").filter(Boolean)
        : [],
      product_names: store.product_names
        ? String(store.product_names).split(", ").filter(Boolean)
        : [],
      product_categories: store.product_categories
        ? String(store.product_categories).split(", ").filter(Boolean)
        : [],
    }));

    return NextResponse.json(
      {
        success: true,
        stores,
      },
      { status: 200 },
    );
  } catch (error) {
    console.error("Error GET /api/stores:", error);
    return NextResponse.json(
      { success: false, error: "Error interno del servidor" },
      { status: 500 },
    );
  }
}
