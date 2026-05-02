import jwt from "jsonwebtoken";
import type { ResultSetHeader, RowDataPacket } from "mysql2/promise";
import { type NextRequest, NextResponse } from "next/server";

import pool from "@/lib/db";

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
  const [rows] = await pool.query<RowDataPacket[]>(
    `
      SELECT 1
      FROM user_roles ur
      INNER JOIN roles r ON r.id = ur.role_id
      WHERE ur.user_id = ? AND r.name = 'admin_general'
      LIMIT 1
    `,
    [userId],
  );

  return rows.length > 0;
}

async function ensureDeliveryStatus(statusName: string) {
  const normalized = statusName.trim().toLowerCase() || "asignado";
  const [rows] = await pool.query<RowDataPacket[]>(
    `
      SELECT id
      FROM delivery_status_catalog
      WHERE name = ?
      LIMIT 1
    `,
    [normalized],
  );

  if (rows[0]?.id) {
    return Number(rows[0].id);
  }

  const [result] = await pool.query<ResultSetHeader>(
    `
      INSERT INTO delivery_status_catalog (
        name,
        description,
        sort_order,
        is_final,
        created_at,
        updated_at
      )
      VALUES (?, ?, 1, 0, NOW(), NOW())
    `,
    [normalized, "Pedido asignado a repartidor"],
  );

  return result.insertId;
}

async function isCourier(userId: number) {
  const [rows] = await pool.query<RowDataPacket[]>(
    `
      SELECT 1
      FROM user_roles ur
      INNER JOIN roles r ON r.id = ur.role_id
      WHERE ur.user_id = ? AND r.name = 'repartidor'
      LIMIT 1
    `,
    [userId],
  );

  return rows.length > 0;
}

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const authUser = getAuthUser(req);

    if (!authUser) {
      return NextResponse.json(
        { error: "Token inválido o faltante" },
        { status: 401 },
      );
    }

    if (!(await isAdminGeneral(authUser.id))) {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }

    const { id } = await context.params;
    const orderId = Number(id);

    if (!Number.isInteger(orderId) || orderId <= 0) {
      return NextResponse.json({ error: "ID inválido" }, { status: 400 });
    }

    const body = await req.json();
    const driverUserId = Number(body?.driver_user_id);

    if (!Number.isInteger(driverUserId) || driverUserId <= 0) {
      return NextResponse.json(
        { error: "Repartidor inválido" },
        { status: 400 },
      );
    }

    if (!(await isCourier(driverUserId))) {
      return NextResponse.json(
        { error: "El usuario seleccionado no es repartidor" },
        { status: 400 },
      );
    }

    const [orderRows] = await pool.query<RowDataPacket[]>(
      `
        SELECT id, delivered_at
        FROM orders
        WHERE id = ?
        LIMIT 1
      `,
      [orderId],
    );

    if (!orderRows.length) {
      return NextResponse.json(
        { error: "Pedido no encontrado" },
        { status: 404 },
      );
    }

    if (orderRows[0]?.delivered_at) {
      return NextResponse.json(
        { error: "El pedido ya fue entregado" },
        { status: 400 },
      );
    }

    const deliveryStatusId = await ensureDeliveryStatus("asignado");
    const [deliveryRows] = await pool.query<RowDataPacket[]>(
      `
        SELECT id
        FROM delivery
        WHERE order_id = ?
        LIMIT 1
      `,
      [orderId],
    );

    if (deliveryRows.length > 0) {
      await pool.query(
        `
          UPDATE delivery
          SET
            driver_user_id = ?,
            delivery_status_id = ?,
            assigned_at = COALESCE(assigned_at, NOW()),
            updated_at = NOW()
          WHERE order_id = ?
        `,
        [driverUserId, deliveryStatusId, orderId],
      );
    } else {
      await pool.query(
        `
          INSERT INTO delivery (
            order_id,
            driver_user_id,
            delivery_status_id,
            assigned_at,
            created_at,
            updated_at
          )
          VALUES (?, ?, ?, NOW(), NOW(), NOW())
        `,
        [orderId, driverUserId, deliveryStatusId],
      );
    }

    return NextResponse.json({
      success: true,
      message: "Repartidor asignado correctamente",
    });
  } catch (error) {
    console.error("Error PATCH /api/admin/orders/[id]/delivery:", error);
    return NextResponse.json(
      {
        error: "No se pudo asignar el repartidor.",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}
