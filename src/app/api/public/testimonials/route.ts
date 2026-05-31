import type { RowDataPacket } from "mysql2/promise";
import { NextResponse } from "next/server";

import pool, { logDbUsage } from "@/lib/db";
import {
  getPublicErrorMessage,
  logPublicApiError,
} from "@/lib/public-api-errors";

type TestimonialRow = RowDataPacket & {
  id: number;
  rating: number;
  title: string | null;
  comment_text: string | null;
  created_at: string;
  first_name: string | null;
  last_name: string | null;
  business_name: string | null;
};

function getInitials(firstName: string | null, lastName: string | null) {
  const parts = [firstName, lastName]
    .map((value) => String(value ?? "").trim())
    .filter(Boolean)
    .slice(0, 2);

  if (parts.length === 0) {
    return "CL";
  }

  return parts.map((part) => part.charAt(0).toUpperCase()).join("");
}

function getMaskedName(firstName: string | null, lastName: string | null) {
  const first = String(firstName ?? "").trim();
  const last = String(lastName ?? "").trim();

  if (!first && !last) {
    return "Cliente verificado";
  }

  const maskedFirst = first ? `${first.charAt(0).toUpperCase()}.` : "";
  const maskedLast = last ? ` ${last.charAt(0).toUpperCase()}.` : "";

  return `${maskedFirst}${maskedLast}`.trim();
}

export async function GET() {
  try {
    logDbUsage("/api/public/testimonials");

    const [rows] = await pool.query<TestimonialRow[]>(
      `
        SELECT
          r.id,
          r.rating,
          r.title,
          r.comment_text,
          r.created_at,
          u.first_name,
          u.last_name,
          b.name AS business_name
        FROM reviews r
        INNER JOIN users u ON u.id = r.user_id
        LEFT JOIN orders o ON o.id = r.order_id
        LEFT JOIN business b ON b.id = COALESCE(o.business_id, r.target_id)
        WHERE r.is_visible = 1
          AND r.comment_text IS NOT NULL
          AND TRIM(r.comment_text) <> ''
        ORDER BY r.created_at DESC, r.id DESC
        LIMIT 6
      `,
    );

    const testimonials = rows.map((row) => ({
      id: row.id,
      initials: getInitials(row.first_name, row.last_name),
      name: getMaskedName(row.first_name, row.last_name),
      text: String(row.comment_text ?? "").trim(),
      title: String(row.title ?? "").trim() || null,
      rating: Math.max(1, Math.min(5, Number(row.rating ?? 5))),
      businessName: row.business_name,
      createdAt: row.created_at,
    }));

    return NextResponse.json(
      {
        success: true,
        testimonials,
      },
      { status: 200 },
    );
  } catch (error) {
    logPublicApiError("[testimonials_error]", error);

    return NextResponse.json(
      {
        success: false,
        error: getPublicErrorMessage(
          error,
          "No pudimos cargar las reseñas. Intenta nuevamente.",
        ),
        testimonials: [],
      },
      { status: 503 },
    );
  }
}
