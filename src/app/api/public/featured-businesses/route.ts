import type { RowDataPacket } from "mysql2/promise";
import { NextResponse } from "next/server";

import { getBusinessOpenStatuses } from "@/lib/business-hours";
import pool, { logDbUsage } from "@/lib/db";
import {
  getPublicErrorMessage,
  logPublicApiError,
} from "@/lib/public-api-errors";

type FeaturedBusinessRow = RowDataPacket & {
  id: number;
  name: string;
  city: string | null;
  district: string | null;
  logo_url: string | null;
  cover_image_url: string | null;
  image_url: string | null;
  rating_average: number | string | null;
  is_open: number | boolean;
  status_id: number | null;
  categories: string | null;
  product_count: number | string | null;
};

export async function GET() {
  try {
    logDbUsage("/api/public/featured-businesses");

    const [rows] = await pool.query<FeaturedBusinessRow[]>(
      `
        SELECT
          b.id,
          b.name,
          b.city,
          b.district,
          b.logo_url,
          b.cover_image_url,
          (
            SELECT bi.image_url
            FROM business_images bi
            WHERE bi.business_id = b.id
            ORDER BY bi.is_cover DESC, bi.sort_order ASC, bi.id ASC
            LIMIT 1
          ) AS image_url,
          b.rating_average,
          b.is_open,
          b.status_id,
          GROUP_CONCAT(DISTINCT bc.name ORDER BY bc.name SEPARATOR ', ') AS categories,
          COUNT(DISTINCT p.id) AS product_count
        FROM business b
        LEFT JOIN status_catalog bsc ON bsc.id = b.status_id
        LEFT JOIN business_category_map bcm ON bcm.business_id = b.id
        LEFT JOIN business_categories bc ON bc.id = bcm.category_id
        LEFT JOIN products p ON p.business_id = b.id
        LEFT JOIN status_catalog psc ON psc.id = p.status_id
        WHERE (
          b.status_id = 1
          OR LOWER(COALESCE(bsc.name, '')) IN ('active', 'activo')
        )
          AND (
            p.id IS NULL
            OR p.status_id = 1
            OR LOWER(COALESCE(psc.name, '')) IN ('active', 'activo')
          )
        GROUP BY b.id
        ORDER BY b.is_open DESC, product_count DESC, b.rating_average DESC, b.id DESC
        LIMIT 8
      `,
    );

    const openStatuses = await getBusinessOpenStatuses(
      pool,
      rows.map((row) => Number(row.id)),
      new Map(
        rows.map((row) => [
          Number(row.id),
          {
            statusId: Number(row.status_id ?? 1),
            fallbackOpen: Boolean(row.is_open),
          },
        ]),
      ),
    );

    const businesses = rows.map((row) => ({
      id: row.id,
      name: row.name,
      city: row.city,
      district: row.district,
      category:
        String(row.categories ?? "")
          .split(", ")
          .filter(Boolean)[0] ?? "Negocio local",
      categories: String(row.categories ?? "")
        .split(", ")
        .filter(Boolean),
      logoUrl: row.logo_url,
      imageUrl: row.image_url ?? row.cover_image_url ?? row.logo_url,
      ratingAverage: Number(row.rating_average ?? 0),
      productCount: Number(row.product_count ?? 0),
      isOpen: openStatuses.get(Number(row.id)) ?? Boolean(row.is_open),
    }));

    return NextResponse.json(
      {
        success: true,
        businesses,
      },
      { status: 200 },
    );
  } catch (error) {
    logPublicApiError("[featured_businesses_error]", error);

    return NextResponse.json(
      {
        success: false,
        error: getPublicErrorMessage(
          error,
          "No pudimos cargar los negocios destacados. Intenta nuevamente.",
        ),
        businesses: [],
      },
      { status: 503 },
    );
  }
}
