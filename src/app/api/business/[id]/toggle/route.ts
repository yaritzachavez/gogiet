import { type NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const businessId = Number(id);

    if (!businessId) {
      return NextResponse.json(
        { error: "ID de negocio inválido" },
        { status: 400 },
      );
    }

    const [rows]: any = await pool.query(
      "SELECT is_open FROM business WHERE id = ? LIMIT 1",
      [businessId],
    );

    if (!rows.length) {
      return NextResponse.json(
        { error: "Negocio no encontrado" },
        { status: 404 },
      );
    }

    return NextResponse.json({
      business_id: businessId,
      exists: true,
      is_open_now: rows[0].is_open,
    });
  } catch (error) {
    console.error("Error GET toggle:", error);
    return NextResponse.json(
      { error: "Error interno del servidor" },
      { status: 500 },
    );
  }
}

export async function PUT(
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const businessId = Number(id);

    if (!businessId) {
      return NextResponse.json(
        { error: "ID de negocio inválido" },
        { status: 400 },
      );
    }

    const [rows]: any = await pool.query(
      "SELECT is_open FROM business WHERE id = ? LIMIT 1",
      [businessId],
    );

    if (!rows.length) {
      return NextResponse.json(
        { error: "Negocio no encontrado" },
        { status: 404 },
      );
    }

    const currentStatus = Number(rows[0].is_open);
    const newStatus = currentStatus === 1 ? 0 : 1;

    await pool.query(
      "UPDATE business SET is_open = ?, updated_at = NOW() WHERE id = ?",
      [newStatus, businessId],
    );

    return NextResponse.json({
      message: "Estado actualizado",
      business_id: businessId,
      old_status: currentStatus,
      new_status: newStatus,
      created: false,
    });
  } catch (error) {
    console.error("Error PUT toggle:", error);
    return NextResponse.json(
      { error: "Error interno del servidor" },
      { status: 500 },
    );
  }
}
