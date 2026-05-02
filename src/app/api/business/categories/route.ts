import { NextResponse } from "next/server";
import pool from "@/lib/db";

export async function GET() {
  try {
    const [rows] = await pool.query(
      "SELECT id, name FROM business_categories ORDER BY name ASC"
    );

    return NextResponse.json(
      { categories: rows },
      { status: 200 }
    );

  } catch (error) {
    console.error("❌ Error al obtener categorías:", error);
    return NextResponse.json(
      { error: "Error interno del servidor" },
      { status: 500 }
    );
  }
}