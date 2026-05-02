import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { validateAuth } from "@/lib/authToken";

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    if (!validateAuth(req)) {
      return NextResponse.json(
        { error: "Token inválido o faltante" },
        { status: 401 }
      );
    }

    // ⬇️ FIX IMPORTANTE — params ahora es Promise
    const { id } = await context.params;
    const [rows] = await pool.query(
      `
      SELECT 
        pc.id,
        pc.name,
        pc.created_at,
        pc.updated_at,
        COUNT(pcm.product_id) AS products_count
      FROM product_categories pc
      LEFT JOIN product_category_map pcm ON pcm.category_id = pc.id
      LEFT JOIN products p ON p.id = pcm.product_id AND p.business_id = ?
      WHERE pcm.product_id IS NULL OR p.business_id = ?
      GROUP BY pc.id
      ORDER BY name ASC
      `,
      [id, id]
    );

    return NextResponse.json({ categories: rows }, { status: 200 });
  } catch (error) {
    console.error("❌ Error GET /categories/[id]:", error);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
