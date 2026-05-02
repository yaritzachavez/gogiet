import jwt from "jsonwebtoken";
import { NextResponse } from "next/server";
import pool from "@/lib/db";

const roleAliases: Record<string, string> = {
  ADMIN: "admin_general",
  OWNER: "business_admin",
  MANAGER: "business_staff",
  DELIVERY: "repartidor",
  CUSTOMER: "cliente",
};

function normalizeRole(role: unknown) {
  const roleName = String(role);
  return roleAliases[roleName] ?? roleName;
}

export async function PUT(
  req: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const userId = Number(id);

  if (!userId) {
    return NextResponse.json({ error: "ID inválido" }, { status: 400 });
  }

  const connection = await pool.getConnection();

  try {
    const auth = req.headers.get("authorization");
    if (!auth?.startsWith("Bearer ")) {
      return NextResponse.json(
        { error: "Token no proporcionado" },
        { status: 401 },
      );
    }

    jwt.verify(auth.split(" ")[1], process.env.JWT_SECRET as string);

    const body = await req.json();
    const { roles, ...fields } = body;

    await connection.beginTransaction();

    const allowedFields = [
      "first_name",
      "last_name",
      "email",
      "phone",
      "status_id",
    ];
    const updates: string[] = [];
    const values: any[] = [];

    for (const key of allowedFields) {
      if (fields[key] !== undefined) {
        updates.push(`${key} = ?`);
        values.push(fields[key]);
      }
    }

    if (updates.length > 0) {
      values.push(userId);
      await connection.query(
        `UPDATE users SET ${updates.join(", ")}, updated_at = NOW() WHERE id = ?`,
        values,
      );
    }

    if (Array.isArray(roles)) {
      const roleNames = roles.map(normalizeRole).filter(Boolean);

      await connection.query("DELETE FROM user_roles WHERE user_id = ?", [
        userId,
      ]);

      if (roleNames.length > 0) {
        const placeholders = roleNames.map(() => "?").join(",");
        const [roleRows] = await connection.query<any[]>(
          `SELECT id FROM roles WHERE name IN (${placeholders})`,
          roleNames,
        );

        if (roleRows.length > 0) {
          const insertValues = roleRows.map((role) => [userId, role.id]);
          await connection.query(
            "INSERT INTO user_roles (user_id, role_id) VALUES ?",
            [insertValues],
          );
        }
      }
    }

    await connection.commit();

    const [updatedUser] = await pool.query(
      `
        SELECT
          u.id,
          u.first_name,
          u.last_name,
          u.email,
          u.phone,
          u.status_id,
          u.created_at,
          u.updated_at,
          JSON_ARRAYAGG(JSON_OBJECT('id', r.id, 'name', r.name)) AS roles
        FROM users u
        LEFT JOIN user_roles ur ON ur.user_id = u.id
        LEFT JOIN roles r ON r.id = ur.role_id
        WHERE u.id = ?
        GROUP BY u.id
      `,
      [userId],
    );

    return NextResponse.json({
      success: true,
      message: "Usuario actualizado correctamente",
      user: (updatedUser as any[])[0] ?? null,
    });
  } catch (error) {
    await connection.rollback();
    console.error("Error al actualizar usuario:", error);
    return NextResponse.json(
      {
        error: "Error al actualizar usuario",
        details: (error as Error).message,
      },
      { status: 500 },
    );
  } finally {
    connection.release();
  }
}
