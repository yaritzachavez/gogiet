import { NextResponse } from "next/server";
import pool from "@/lib/db";

export async function GET() {
  try {
    const [rows] = await pool.query(`
      SELECT
        b.id,
        b.name,
        bcm.category_id AS business_category_id,
        bc.name AS category_name,
        b.city,
        b.district,
        b.address,
        b.phone,
        b.logo_url,
        b.cover_image_url,
        b.min_order_amount,
        b.estimated_delivery_minutes,
        b.rating_average,
        b.is_open AS is_open_now,
        b.status_id,
        b.created_at,
        b.updated_at
      FROM business b
      LEFT JOIN business_category_map bcm ON bcm.business_id = b.id
      LEFT JOIN business_categories bc ON bc.id = bcm.category_id
      WHERE b.status_id = 1 AND b.is_open = 1
      ORDER BY b.id DESC
    `);

    const negocios = (rows as any[]).map((business) => ({
      id: business.id,
      name: business.name,
      category_id: business.business_category_id,
      category_name: business.category_name,
      city: business.city,
      district: business.district,
      address: business.address,
      phone: business.phone,
      logo_url: business.logo_url,
      cover_image_url: business.cover_image_url,
      min_order_amount: business.min_order_amount,
      estimated_delivery_minutes: business.estimated_delivery_minutes,
      rating_average: business.rating_average,
      is_open_now: Boolean(business.is_open_now),
      status_id: business.status_id,
      created_at: business.created_at,
      updated_at: business.updated_at,
    }));

    return NextResponse.json({ message: "OK", negocios }, { status: 200 });
  } catch (error) {
    console.error("Error al obtener negocios:", error);
    return NextResponse.json(
      { error: "Error interno del servidor" },
      { status: 500 },
    );
  }
}
