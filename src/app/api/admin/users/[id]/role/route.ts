import { type NextRequest, NextResponse } from "next/server";

import { recordAuditLog } from "@/lib/audit-log";
import pool from "@/lib/db";
import { requireAdminGeneral } from "@/lib/permissions";
import { mapDbRolesToPublicRoles, normalizeRoleInputs } from "@/lib/role-utils";

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdminGeneral(req);
  if (!auth.ok) return auth.response;

  const { id } = await context.params;
  const userId = Number(id);

  if (!Number.isInteger(userId) || userId <= 0) {
    return NextResponse.json({ error: "ID inválido" }, { status: 400 });
  }

  const body = await req.json();
  const requestedRoles = normalizeRoleInputs(body.roles ?? body.role);

  if (!requestedRoles.length) {
    return NextResponse.json(
      { error: "Debes seleccionar al menos un rol permitido" },
      { status: 400 },
    );
  }

  if (userId === auth.access.userId) {
    return NextResponse.json(
      { error: "No puedes modificar tus propios roles desde este panel" },
      { status: 403 },
    );
  }

  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const [userRows] = await connection.query(
      `
        SELECT
          u.id,
          JSON_ARRAYAGG(
            CASE
              WHEN r.id IS NULL THEN NULL
              ELSE r.name
            END
          ) AS roles
        FROM users
        u
        LEFT JOIN user_roles ur ON ur.user_id = u.id
        LEFT JOIN roles r ON r.id = ur.role_id
        WHERE u.id = ?
        GROUP BY u.id
      `,
      [userId],
    );

    if (!Array.isArray(userRows) || userRows.length === 0) {
      await connection.rollback();
      return NextResponse.json(
        { error: "Usuario no encontrado" },
        { status: 404 },
      );
    }

    const placeholders = requestedRoles.map(() => "?").join(",");

    const [roleRows] = await connection.query(
      `
        SELECT id, name
        FROM roles
        WHERE name IN (${placeholders})
      `,
      requestedRoles,
    );

    if (!Array.isArray(roleRows) || roleRows.length !== requestedRoles.length) {
      await connection.rollback();
      return NextResponse.json(
        { error: "Uno o más roles solicitados no existen" },
        { status: 400 },
      );
    }

    await connection.query("DELETE FROM user_roles WHERE user_id = ?", [
      userId,
    ]);

    for (const row of roleRows as Array<{ id: number }>) {
      await connection.query(
        `
          INSERT INTO user_roles (user_id, role_id, assigned_at)
          VALUES (?, ?, NOW())
        `,
        [userId, Number(row.id)],
      );
    }

    await recordAuditLog(
      {
        userId: auth.access.userId,
        action: "ASSIGN_ROLES",
        resourceType: "user",
        resourceId: userId,
        oldValue:
          Array.isArray(userRows) && userRows[0] && "roles" in userRows[0]
            ? userRows[0].roles
            : null,
        newValue: requestedRoles,
        ip: req.headers.get("x-forwarded-for"),
        userAgent: req.headers.get("user-agent"),
      },
      connection,
    );

    await connection.commit();

    return NextResponse.json({
      success: true,
      message: "Roles actualizados correctamente",
      roles: mapDbRolesToPublicRoles(requestedRoles),
    });
  } catch (error) {
    await connection.rollback();
    console.error("Error PATCH /api/admin/users/:id/role:", error);
    return NextResponse.json(
      {
        error: "Error al actualizar rol",
        debug: process.env.NODE_ENV === "production" ? undefined : (error instanceof Error ? error.message : String(error)),
      },
      { status: 500 },
    );
  } finally {
    connection.release();
  }
}
