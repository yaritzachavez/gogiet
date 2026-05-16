import type { RowDataPacket } from "mysql2/promise";
import { NextResponse } from "next/server";
import { ensureBusinessLogoColumn } from "@/lib/business-logo";
import pool from "@/lib/db";

type PublicBusinessRow = RowDataPacket & {
  id: number;
  name: string;
  business_category_id: number | null;
  category_name: string | null;
  city: string | null;
  district: string | null;
  address: string | null;
  phone: string | null;
  logo_url: string | null;
  cover_image_url: string | null;
  min_order_amount: number | string | null;
  estimated_delivery_minutes: number | null;
  rating_average: number | string | null;
  is_open_now: number | boolean | null;
  status_id: number | null;
  status_name: string | null;
  created_at: string;
  updated_at: string;
};

export async function GET() {
  try {
    await ensureBusinessLogoColumn();
    const [rows] = await pool.query<PublicBusinessRow[]>(`
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
        sc.name AS status_name,
        b.created_at,
        b.updated_at
      FROM business b
      LEFT JOIN status_catalog sc ON sc.id = b.status_id
      LEFT JOIN business_category_map bcm ON bcm.business_id = b.id
      LEFT JOIN business_categories bc ON bc.id = bcm.category_id
      WHERE (
        b.status_id = 1
        OR LOWER(COALESCE(sc.name, '')) IN ('activo', 'active')
      )
      ORDER BY b.id DESC
    `);

    const businesses = rows.map((business) => ({
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
      rating_average: Number(business.rating_average ?? 0),
      is_open_now: Boolean(business.is_open_now),
      status_id: business.status_id,
      status_name: business.status_name,
      created_at: business.created_at,
      updated_at: business.updated_at,
    }));

    return NextResponse.json(
      {
        success: true,
        businesses,
        negocios: businesses,
      },
      { status: 200 },
    );
  } catch (error) {
    console.error("Error al obtener negocios:", error);
    return NextResponse.json({
      success: true,
      businesses: [],
      negocios: [],
    });
  }
}
