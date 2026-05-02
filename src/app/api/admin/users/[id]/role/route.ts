import jwt from "jsonwebtoken";
import { type NextRequest, NextResponse } from "next/server";

import pool from "@/lib/db";
import { mapDbRolesToPublicRoles, normalizeRoleInputs } from "@/lib/role-utils";

type JwtPayload = {
  id: number;
};

function getAuthUser(req: NextRequest) {
  const auth = req.headers.get("authorization");
  const token = auth?.startsWith("Bearer ")
    ? auth.split(" ")[1]
    : req.cookies.get("authToken")?.value;
  const secret = process.env.JWT_SECRET || "gogi-dev-secret";

  if (!token) return null;

  try {
    return jwt.verify(token, secret) as JwtPayload;
  } catch {
    return null;
  }
}

async function isAdminGeneral(userId: number) {
  const [rows] = await pool.query(
    `
      SELECT 1
      FROM user_roles ur
      INNER JOIN roles r ON r.id = ur.role_id
      WHERE ur.user_id = ? AND r.name = 'admin_general'
      LIMIT 1
    `,
    [userId],
  );

  return Array.isArray(rows) && rows.length > 0;
}

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const authUser = getAuthUser(req);

  if (!authUser) {
    return NextResponse.json(
      { error: "Token inválido o faltante" },
      { status: 401 },
    );
  }

  const hasAccess = await isAdminGeneral(authUser.id);

  if (!hasAccess) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

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

  if (userId === authUser.id) {
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
        SELECT id
        FROM users
        WHERE id = ?
        LIMIT 1
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
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  } finally {
    connection.release();
  }
}
