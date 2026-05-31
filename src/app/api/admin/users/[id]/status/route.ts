import type { RowDataPacket } from "mysql2/promise";
import { type NextRequest, NextResponse } from "next/server";

import { recordAuditLog } from "@/lib/audit-log";
import { getUserColumns, invalidateUserSessions } from "@/lib/auth-security";
import {
  getActiveAuthStatusId,
  getInactiveAuthStatusId,
} from "@/lib/auth-users";
import pool from "@/lib/db";
import { requireAdminGeneral } from "@/lib/permissions";

type UserStatusRow = RowDataPacket & {
  id: number;
  status_id: number | null;
};

function parseRequestedActiveState(body: unknown) {
  const input = body as { isActive?: unknown; status?: unknown } | null;

  if (typeof input?.isActive === "boolean") {
    return input.isActive;
  }

  const status = String(input?.status ?? "")
    .trim()
    .toUpperCase();

  if (status === "ACTIVE" || status === "ACTIVO") return true;
  if (status === "INACTIVE" || status === "INACTIVO") return false;

  return null;
}

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdminGeneral(req);
  if (!auth.ok) return auth.response;

  const { id } = await context.params;
  const userId = Number(id);

  if (!Number.isInteger(userId) || userId <= 0) {
    return NextResponse.json(
      { success: false, error: "ID de usuario inválido." },
      { status: 400 },
    );
  }

  if (userId === auth.access.userId) {
    return NextResponse.json(
      {
        success: false,
        error: "No puedes cambiar el estado de tu propia cuenta.",
      },
      { status: 403 },
    );
  }

  const body = await req.json().catch(() => null);
  const isActive = parseRequestedActiveState(body);

  if (isActive === null) {
    return NextResponse.json(
      { success: false, error: "Estado inválido. Usa ACTIVE o INACTIVE." },
      { status: 400 },
    );
  }

  const conn = await pool.getConnection();

  try {
    await conn.beginTransaction();

    const activeStatusId = await getActiveAuthStatusId();
    const inactiveStatusId = await getInactiveAuthStatusId();
    const nextStatusId = isActive ? activeStatusId : inactiveStatusId;
    const userColumns = await getUserColumns(conn);
    const updateFields = [
      "status_id = ?",
      userColumns.has("status")
        ? `status = '${isActive ? "ACTIVE" : "INACTIVE"}'`
        : null,
      "updated_at = NOW()",
    ].filter(Boolean);

    const [userRows] = await conn.query<UserStatusRow[]>(
      `
        SELECT id, status_id
        FROM users
        WHERE id = ?
        LIMIT 1
      `,
      [userId],
    );
    const user = userRows[0] ?? null;

    if (!user) {
      await conn.rollback();
      return NextResponse.json(
        { success: false, error: "Usuario no encontrado." },
        { status: 404 },
      );
    }

    await conn.query(
      `
        UPDATE users
        SET ${updateFields.join(", ")}
        WHERE id = ?
      `,
      [nextStatusId, userId],
    );

    if (!isActive) {
      await invalidateUserSessions(userId);
    }

    await recordAuditLog(
      {
        userId: auth.access.userId,
        action: isActive ? "ACTIVATE_USER" : "DEACTIVATE_USER",
        resourceType: "user",
        resourceId: userId,
        oldValue: { status_id: user.status_id },
        newValue: { status_id: nextStatusId, isActive },
        ip: req.headers.get("x-forwarded-for"),
        userAgent: req.headers.get("user-agent"),
      },
      conn,
    );

    await conn.commit();

    return NextResponse.json({
      success: true,
      message: isActive ? "Usuario activado." : "Usuario desactivado.",
      user: {
        id: userId,
        status_id: nextStatusId,
        status: isActive ? "ACTIVE" : "INACTIVE",
        isActive,
      },
    });
  } catch (error) {
    await conn.rollback();
    console.error("Error PATCH /api/admin/users/:id/status:", error);
    return NextResponse.json(
      {
        success: false,
        error: "No se pudo actualizar el estado del usuario.",
      },
      { status: 500 },
    );
  } finally {
    conn.release();
  }
}
