import type { ResultSetHeader, RowDataPacket } from "mysql2/promise";
import { type NextRequest, NextResponse } from "next/server";

import { recordAuditLog } from "@/lib/audit-log";
import pool from "@/lib/db";
import { requirePermission } from "@/lib/permissions";

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
    const access = await requirePermission(
      req,
      "REASSIGN_DRIVER",
      undefined,
      "Solo el administrador general puede reasignar repartidores.",
    );
    if (!access.ok) return access.response;

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
        SELECT id, delivered_at, driver_id
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

    await pool.query(
      `
        UPDATE orders
        SET driver_id = ?, updated_at = NOW()
        WHERE id = ?
      `,
      [driverUserId, orderId],
    );

    await recordAuditLog({
      userId: access.access.userId,
      action: "REASSIGN_DRIVER",
      resourceType: "order",
      resourceId: orderId,
      oldValue: {
        driverUserId: Number(orderRows[0]?.driver_id ?? 0) || null,
      },
      newValue: { driverUserId },
      ip: req.headers.get("x-forwarded-for"),
      userAgent: req.headers.get("user-agent"),
    });

    return NextResponse.json({
      success: true,
      message: "Repartidor asignado correctamente",
    });
  } catch (error) {
    console.error("Error PATCH /api/admin/orders/[id]/delivery:", error);
    return NextResponse.json(
      {
        error: "No se pudo asignar el repartidor.",
        debug:
          process.env.NODE_ENV === "production"
            ? undefined
            : error instanceof Error
              ? error.message
              : String(error),
      },
      { status: 500 },
    );
  }
}
