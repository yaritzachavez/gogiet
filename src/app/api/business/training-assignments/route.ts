import type { RowDataPacket } from "mysql2/promise";
import { type NextRequest, NextResponse } from "next/server";

import { getAuthUser } from "@/lib/admin-security";
import { resolveBusinessAccess } from "@/lib/business-panel";
import pool, { logDbUsage } from "@/lib/db";
import { createNotificationsForUsers } from "@/lib/notifications";
import { assignTrainingToUser, ensureTrainingTables } from "@/lib/trainings";

type TrainingLookupRow = RowDataPacket & {
  id: number;
};

type SellerLookupRow = RowDataPacket & {
  user_id: number;
};

function canManageTrainings(roles: string[]) {
  const normalized = roles.map((role) => String(role).trim().toLowerCase());

  return normalized.some((role) =>
    ["admin_general", "business_admin", "administrador_negocio"].includes(role),
  );
}

export async function POST(req: NextRequest) {
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

    const body = await req.json().catch(() => null);
    const businessId = Number(body?.business_id ?? 0);
    const trainingId = Number(body?.training_id ?? 0);
    const userId = Number(body?.user_id ?? 0);
    const dueDate = String(body?.due_date ?? "").trim();

    if (!trainingId || !userId) {
      return NextResponse.json(
        { success: false, error: "Capacitación y vendedor son obligatorios" },
        { status: 400 },
      );
    }

    const access = await resolveBusinessAccess(authUser.user.id, businessId);
    logDbUsage("/api/business/training-assignments", {
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

    if (!canManageTrainings(access.roles) && !access.isAdmin) {
      return NextResponse.json(
        { success: false, error: "No autorizado para asignar capacitaciones" },
        { status: 403 },
      );
    }

    await ensureTrainingTables(connection);

    const [trainingRows] = await connection.query<TrainingLookupRow[]>(
      `
        SELECT id
        FROM trainings
        WHERE id = ? AND business_id = ?
        LIMIT 1
      `,
      [trainingId, access.businessId],
    );

    if (!trainingRows.length) {
      return NextResponse.json(
        { success: false, error: "Capacitación no encontrada" },
        { status: 404 },
      );
    }

    const [sellerRows] = await connection.query<SellerLookupRow[]>(
      `
        SELECT user_id
        FROM business_managers
        WHERE business_id = ? AND user_id = ?
        LIMIT 1
      `,
      [access.businessId, userId],
    );

    if (!sellerRows.length) {
      return NextResponse.json(
        { success: false, error: "El vendedor no pertenece a este negocio" },
        { status: 404 },
      );
    }

    await connection.beginTransaction();
    const assignmentId = await assignTrainingToUser(
      {
        trainingId,
        businessId: access.businessId,
        userId,
        dueDate: dueDate || null,
        assignedBy: authUser.user.id,
      },
      connection,
    );

    await createNotificationsForUsers(
      [userId],
      {
        type: "training_assignment",
        title: "Nueva capacitación asignada",
        message: "Tienes una nueva capacitación pendiente por completar.",
        relatedId: assignmentId,
      },
      connection,
    );

    await connection.commit();

    return NextResponse.json({
      success: true,
      message: "Capacitación asignada correctamente",
      assignment_id: assignmentId,
    });
  } catch (error) {
    await connection.rollback();
    console.error("Error POST /api/business/training-assignments:", error);
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "No se pudo asignar la capacitación.",
      },
      { status: 500 },
    );
  } finally {
    connection.release();
  }
}
