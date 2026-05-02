import type { ResultSetHeader, RowDataPacket } from "mysql2/promise";
import { type NextRequest, NextResponse } from "next/server";

import { getAuthUser } from "@/lib/admin-security";
import { resolveBusinessAccess } from "@/lib/business-panel";
import pool, { logDbUsage } from "@/lib/db";

type OwnerMemberRow = RowDataPacket & {
  user_id: number;
};

type ManagerMemberRow = RowDataPacket & {
  user_id: number;
  position: string | null;
};

type StatusRow = RowDataPacket & {
  id: number;
  name: string;
};

function splitName(fullName: string) {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);

  return {
    firstName: parts[0] ?? "",
    lastName: parts.slice(1).join(" ") || null,
  };
}

function applyTrainingFlag(position: string | null, estado: string) {
  const basePosition = String(position ?? "Vendedor")
    .replace(/\s*\[capacitacion\]\s*$/i, "")
    .trim();

  if (estado === "En capacitación") {
    return `${basePosition || "Vendedor"} [capacitacion]`;
  }

  return basePosition || "Vendedor";
}

function toPositiveNumber(value: string | null) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const connection = await pool.getConnection();

  try {
    const authUser = getAuthUser(req);

    if (!authUser?.token) {
      return NextResponse.json(
        { success: false, error: "Token faltante" },
        { status: 401 },
      );
    }

    if (!authUser?.user) {
      return NextResponse.json(
        { success: false, error: "Token inválido" },
        { status: 401 },
      );
    }

    const { id } = await context.params;
    const sellerId = Number(id);

    if (!Number.isInteger(sellerId) || sellerId <= 0) {
      return NextResponse.json(
        { success: false, error: "Vendedor inválido" },
        { status: 400 },
      );
    }

    const body = await req.json().catch(() => null);
    const nombre = String(body?.nombre ?? "").trim();
    const telefono = String(body?.telefono ?? "").trim();
    const estado = String(body?.estado ?? "").trim();
    const posicion = String(body?.posicion ?? "").trim();

    if (!nombre) {
      return NextResponse.json(
        { success: false, error: "El nombre es obligatorio" },
        { status: 400 },
      );
    }

    if (!telefono) {
      return NextResponse.json(
        { success: false, error: "El teléfono es obligatorio" },
        { status: 400 },
      );
    }

    if (!["Activo", "En capacitación", "Inactivo"].includes(estado)) {
      return NextResponse.json(
        { success: false, error: "El estado es obligatorio" },
        { status: 400 },
      );
    }

    const requestedBusinessId = toPositiveNumber(
      req.nextUrl.searchParams.get("business_id"),
    );
    const bodyBusinessId = toPositiveNumber(String(body?.business_id ?? ""));
    const access = await resolveBusinessAccess(
      authUser.user.id,
      bodyBusinessId ?? requestedBusinessId,
    );
    logDbUsage("/api/business/team/[id]", {
      userId: access.userId,
      email: access.email,
      role: access.roles,
    });

    if (!access.businessId) {
      return NextResponse.json(
        { success: false, error: "No tienes negocio asignado" },
        { status: 403 },
      );
    }

    const businessId = access.businessId;

    const [ownerRows] = await connection.query<OwnerMemberRow[]>(
      `
        SELECT bo.user_id
        FROM business_owners bo
        WHERE bo.business_id = ? AND bo.user_id = ?
        LIMIT 1
      `,
      [businessId, sellerId],
    );

    const [managerRows] = await connection.query<ManagerMemberRow[]>(
      `
        SELECT bm.user_id, bm.position
        FROM business_managers bm
        WHERE bm.business_id = ? AND bm.user_id = ?
        LIMIT 1
      `,
      [businessId, sellerId],
    );

    const teamRows = [
      ...ownerRows.map((row) => ({
        user_id: Number(row.user_id),
        source: "owner" as const,
        position: null,
      })),
      ...managerRows.map((row) => ({
        user_id: Number(row.user_id),
        source: "manager" as const,
        position: row.position,
      })),
    ];

    if (!teamRows.length) {
      return NextResponse.json(
        { success: false, error: "El vendedor no pertenece a este negocio" },
        { status: 404 },
      );
    }

    const member = teamRows[0];
    const { firstName, lastName } = splitName(nombre);

    if (!firstName) {
      return NextResponse.json(
        { success: false, error: "El nombre es obligatorio" },
        { status: 400 },
      );
    }

    const [statusRows] = await connection.query<StatusRow[]>(
      `
        SELECT id, name
        FROM status_catalog
        WHERE name IN ('activo', 'inactivo')
      `,
    );

    const activeStatusId =
      statusRows.find((row) => row.name === "activo")?.id ?? 1;
    const inactiveStatusId =
      statusRows.find((row) => row.name === "inactivo")?.id ?? 2;

    console.log("Actualizando vendedor", sellerId);

    await connection.beginTransaction();

    await connection.query<ResultSetHeader>(
      `
        UPDATE users
        SET
          first_name = ?,
          last_name = ?,
          phone = ?,
          status_id = ?,
          updated_at = NOW()
        WHERE id = ?
      `,
      [
        firstName,
        lastName,
        telefono,
        estado === "Inactivo" ? inactiveStatusId : activeStatusId,
        sellerId,
      ],
    );

    if (member.source === "manager") {
      await connection.query<ResultSetHeader>(
        `
          UPDATE business_managers
          SET
            is_active = ?,
            position = ?
          WHERE business_id = ? AND user_id = ?
        `,
        [
          estado === "Inactivo" ? 0 : 1,
          applyTrainingFlag(posicion || member.position, estado),
          businessId,
          sellerId,
        ],
      );
    }

    await connection.commit();

    return NextResponse.json({
      success: true,
      message: "Vendedor actualizado correctamente",
    });
  } catch (error) {
    await connection.rollback();
    console.error("Error PATCH /api/business/team/[id]:", error);
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "No se pudo actualizar el vendedor.",
      },
      { status: 500 },
    );
  } finally {
    connection.release();
  }
}

export async function DELETE(
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const authUser = getAuthUser(req);

    if (!authUser?.token) {
      return NextResponse.json(
        { success: false, error: "Token faltante" },
        { status: 401 },
      );
    }

    if (!authUser?.user) {
      return NextResponse.json(
        { success: false, error: "Token inválido" },
        { status: 401 },
      );
    }

    const { id } = await context.params;
    const sellerId = Number(id);

    if (!Number.isInteger(sellerId) || sellerId <= 0) {
      return NextResponse.json(
        { success: false, error: "Vendedor inválido" },
        { status: 400 },
      );
    }

    const requestedBusinessId = toPositiveNumber(
      req.nextUrl.searchParams.get("business_id"),
    );
    const access = await resolveBusinessAccess(
      authUser.user.id,
      requestedBusinessId,
    );

    if (!access.businessId) {
      return NextResponse.json(
        { success: false, error: "No tienes negocio asignado" },
        { status: 403 },
      );
    }

    const [result] = await pool.query<ResultSetHeader>(
      `
        DELETE FROM business_managers
        WHERE business_id = ? AND user_id = ?
      `,
      [access.businessId, sellerId],
    );

    if (!result.affectedRows) {
      return NextResponse.json(
        {
          success: false,
          error:
            "No se pudo quitar al vendedor. Quizá es propietario o no pertenece al negocio.",
        },
        { status: 404 },
      );
    }

    return NextResponse.json({
      success: true,
      message: "Vendedor quitado correctamente",
    });
  } catch (error) {
    console.error("Error DELETE /api/business/team/[id]:", error);
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "No se pudo quitar el vendedor.",
      },
      { status: 500 },
    );
  }
}
