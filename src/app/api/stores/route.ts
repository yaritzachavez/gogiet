import { NextResponse } from "next/server";
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
  created_at: string;
  updated_at: string;
  categories: string | null;
};

export async function GET() {
  try {
    logDbUsage("/api/stores");
    const [rows] = await pool.query(`
      SELECT
        b.id,
        b.name,
        b.city,
        b.district,
        b.address,
        b.phone,
        b.email,
        b.avatar_url,
        b.logo_url,
        b.cover_image_url,
        b.min_order_amount,
        b.estimated_delivery_minutes,
        b.rating_average,
        b.is_open AS is_open_now,
        b.status_id,
        b.created_at,
        b.updated_at,
        GROUP_CONCAT(DISTINCT bc.name ORDER BY bc.name SEPARATOR ', ') AS categories
      FROM business b
      LEFT JOIN business_category_map bcm ON bcm.business_id = b.id
      LEFT JOIN business_categories bc ON bc.id = bcm.category_id
      WHERE b.status_id = 1
      GROUP BY b.id
      ORDER BY b.is_open DESC, b.id DESC
    `);

    const stores = (rows as StoreRow[]).map((store) => ({
      id: store.id,
      name: store.name,
      city: store.city,
      district: store.district,
      address: store.address,
      phone: store.phone,
      email: store.email,
      avatar_url: store.avatar_url,
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
