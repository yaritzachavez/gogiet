import type { ResultSetHeader, RowDataPacket } from "mysql2/promise";
import { type NextRequest, NextResponse } from "next/server";

import { getAuthUser, isAdminGeneral } from "@/lib/admin-security";
import pool from "@/lib/db";

type BusinessStatusRow = RowDataPacket & {
  id: number;
  status_id: number | null;
  is_open: number | boolean | null;
};

function parsePositiveNumber(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { user: authUser } = getAuthUser(req);

    if (!authUser) {
      return NextResponse.json(
        { success: false, error: "Token inválido o faltante" },
        { status: 401 },
      );
    }

    if (!(await isAdminGeneral(authUser.id))) {
      return NextResponse.json(
        { success: false, error: "No autorizado" },
        { status: 403 },
      );
    }

    const { id } = await context.params;
    const businessId = parsePositiveNumber(id);

    if (!businessId) {
      return NextResponse.json(
        { success: false, error: "Negocio inválido" },
        { status: 400 },
      );
    }

    const body = await req.json();
    const isActive = Boolean(body?.is_active);

    await pool.query<ResultSetHeader>(
      `
        UPDATE business
        SET status_id = ?, is_open = ?, updated_at = NOW()
        WHERE id = ?
      `,
      [isActive ? 1 : 2, isActive ? 1 : 0, businessId],
    );

    const [rows] = await pool.query<BusinessStatusRow[]>(
      `
        SELECT id, status_id, is_open
        FROM business
        WHERE id = ?
        LIMIT 1
      `,
      [businessId],
    );

    const business = rows[0] ?? null;

    return NextResponse.json({
      success: true,
      message: isActive ? "Negocio activado" : "Negocio desactivado",
      business: business
        ? {
            id: business.id,
            status_id: business.status_id,
            is_active:
              Number(business.status_id ?? 0) === 1 &&
              Boolean(business.is_open),
          }
        : null,
    });
  } catch (error) {
    console.error("Error PATCH /api/admin/business/[id]/status:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Error al actualizar negocio",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}
