import jwt from "jsonwebtoken";
import type { ResultSetHeader, RowDataPacket } from "mysql2/promise";
import { type NextRequest, NextResponse } from "next/server";

import pool from "@/lib/db";
import { addSupportMessage, getOrCreateSupportThread } from "@/lib/support";

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

function normalizeCatalogName(value: unknown, fallback: string) {
  const normalized = String(value ?? "")
    .trim()
    .toLowerCase();

  return normalized || fallback;
}

async function getOrCreateStatusId(name: string) {
  const normalizedName = normalizeCatalogName(name, "pendiente");
  const [rows] = await pool.query<RowDataPacket[]>(
    `
      SELECT id
      FROM order_status_catalog
      WHERE name = ?
      LIMIT 1
    `,
    [normalizedName],
  );

  if (rows[0]?.id) {
    return Number(rows[0].id);
  }

  const descriptions: Record<string, string> = {
    por_validar_pago: "Transferencia recibida pendiente de validacion",
    pago_validado: "Pago validado por administracion",
    pago_rechazado: "Pago rechazado por administracion",
  };

  const [result] = await pool.query<ResultSetHeader>(
    `
      INSERT INTO order_status_catalog (
        name,
        description,
        sort_order,
        is_final,
        created_at,
        updated_at
      )
      VALUES (?, ?, ?, 0, NOW(), NOW())
    `,
    [
      normalizedName,
      descriptions[normalizedName] ?? `Estado ${normalizedName}`,
      normalizedName === "pago_validado" ? 3 : 2,
    ],
  );

  return result.insertId;
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
    const action = String(body?.action ?? "")
      .trim()
      .toLowerCase();
    const reason = String(body?.reason ?? "").trim();

    if (action !== "approve" && action !== "reject") {
      return NextResponse.json({ error: "Acción inválida" }, { status: 400 });
    }

    if (action === "reject" && !reason) {
      return NextResponse.json(
        { error: "Debes indicar un motivo de rechazo" },
        { status: 400 },
      );
    }

    const [rows] = await pool.query<RowDataPacket[]>(
      `
        SELECT
          o.id,
          o.user_id,
          COALESCE(o.payment_method, pm.name) AS payment_method,
          osc.name AS status_name
        FROM orders o
        LEFT JOIN payment_methods pm ON pm.id = o.payment_method_id
        LEFT JOIN order_status_catalog osc ON osc.id = o.order_status_id
        WHERE o.id = ?
        LIMIT 1
      `,
      [orderId],
    );

    const order = rows[0];

    if (!order) {
      return NextResponse.json(
        { error: "Pedido no encontrado" },
        { status: 404 },
      );
    }

    if (normalizeCatalogName(order.payment_method, "") !== "transferencia") {
      return NextResponse.json(
        { error: "Solo se pueden validar pagos por transferencia" },
        { status: 400 },
      );
    }

    if (normalizeCatalogName(order.status_name, "") !== "por_validar_pago") {
      return NextResponse.json(
        { error: "Este pedido ya no está pendiente de validación" },
        { status: 400 },
      );
    }

    const nextStatus =
      action === "approve" ? "pago_validado" : "pago_rechazado";
    const nextStatusId = await getOrCreateStatusId(nextStatus);

    await pool.query(
      `
        UPDATE orders
        SET order_status_id = ?, updated_at = NOW()
        WHERE id = ?
      `,
      [nextStatusId, orderId],
    );

    const adminMessage =
      action === "approve"
        ? "ADMIN_GENERAL validó correctamente el pago por transferencia."
        : `ADMIN_GENERAL rechazó el pago por transferencia. Motivo: ${reason}`;
    const customerNotice =
      action === "approve"
        ? "Tu pago por transferencia fue validado. Tu pedido podrá continuar con la preparación."
        : `Tu pago por transferencia fue rechazado. Motivo: ${reason}`;

    await pool.query(
      `
        INSERT INTO admin_messages (order_id, user_id, type, message, file_url)
        VALUES (?, ?, 'payment_validation', ?, NULL)
      `,
      [orderId, authUser.id, adminMessage],
    );

    await pool.query(
      `
        INSERT INTO order_notes (order_id, user_id, note_type, note_text)
        VALUES (?, ?, 'system', ?)
      `,
      [orderId, authUser.id, customerNotice],
    );

    const supportThreadId = await getOrCreateSupportThread({
      userId: Number(order.user_id),
      orderId,
    });

    await addSupportMessage({
      threadId: supportThreadId,
      senderId: authUser.id,
      senderType: "admin",
      message:
        action === "approve"
          ? "Pago por transferencia aprobado por ADMIN_GENERAL."
          : `Pago por transferencia rechazado por ADMIN_GENERAL. Motivo: ${reason}`,
      messageType: "text",
    });

    return NextResponse.json({
      success: true,
      message:
        action === "approve"
          ? "Pago aprobado correctamente"
          : "Pago rechazado correctamente",
      status: nextStatus,
    });
  } catch (error) {
    console.error("Error PATCH /api/admin/orders/[id]/payment:", error);
    return NextResponse.json(
      {
        error: "No se pudo validar el pago.",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}
