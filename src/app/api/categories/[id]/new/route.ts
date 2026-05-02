import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { validateAuth } from "@/lib/authToken";

export async function POST(req: NextRequest) {
  try {
    // 1. Validar token
    const payload = validateAuth(req);
    if (!payload) {
      return NextResponse.json(
        { error: "Token inválido o faltante" },
        { status: 401 }
      );
    }

    // 2. Leer body
    const { name, business_id } = await req.json();

    // 3. Validar campos obligatorios
    if (!business_id) {
      return NextResponse.json(
        { error: "El business_id es obligatorio" },
        { status: 400 }
      );
    }

    if (!name || name.trim() === "") {
      return NextResponse.json(
        { error: "El nombre es obligatorio" },
        { status: 400 }
      );
    }

    const cleanName = name.trim();

    // 4. Verificar que el negocio exista
    const [business] = await pool.query(
      "SELECT id FROM business WHERE id = ?",
      [business_id]
    );

    if (!Array.isArray(business) || business.length === 0) {
      return NextResponse.json(
        { error: "El negocio no existe" },
        { status: 404 }
      );
    }

    // 5. Evitar categorías duplicadas globales
    const [dupCheck] = await pool.query(
      `
        SELECT id 
        FROM product_categories
        WHERE name = ?
      `,
      [cleanName]
    );

    if (Array.isArray(dupCheck) && dupCheck.length > 0) {
      return NextResponse.json(
        { error: "Ya existe una categoría con ese nombre" },
        { status: 409 }
      );
    }

    // 6. Insertar categoría
    await pool.query(
      `
        INSERT INTO product_categories (name)
        VALUES (?)
      `,
      [cleanName]
    );

    return NextResponse.json(
      { message: "Categoría creada correctamente" },
      { status: 201 }
    );

  } catch (err) {
    console.error("❌ Error POST /categories:", err);
    return NextResponse.json(
      { error: "Error interno del servidor" },
      { status: 500 }
    );
  }
}
