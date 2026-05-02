import type { RowDataPacket } from "mysql2/promise";
import { type NextRequest, NextResponse } from "next/server";

import { getAuthUser } from "@/lib/admin-security";
import { ensureOrderStatus, resolveBusinessAccess } from "@/lib/business-panel";
import pool, { logDbUsage } from "@/lib/db";

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
    const orderId = Number(id);
    const body = await req.json().catch(() => null);
    const status = String(body?.status ?? "")
      .trim()
      .toLowerCase();

    if (!Number.isInteger(orderId) || orderId <= 0) {
      return NextResponse.json(
        { success: false, error: "Pedido inválido" },
        { status: 400 },
      );
    }

    if (!["en_preparacion", "preparando"].includes(status)) {
      return NextResponse.json(
        { success: false, error: "Estado inválido" },
        { status: 400 },
      );
    }

    const [orderRows] = await connection.query<RowDataPacket[]>(
      `
        SELECT business_id
        FROM orders
        WHERE id = ?
        LIMIT 1
      `,
      [orderId],
    );
    const businessId = Number(orderRows[0]?.business_id ?? 0);

    if (!businessId) {
      return NextResponse.json(
        { success: false, error: "Pedido no encontrado" },
        { status: 404 },
      );
    }

    const access = await resolveBusinessAccess(authUser.user.id, businessId);
    logDbUsage("/api/business/orders/[id]/status", {
      userId: access.userId,
      email: access.email,
      role: access.roles,
    });

    if (access.businessId !== businessId) {
      return NextResponse.json(
        { success: false, error: "No tienes acceso a este pedido" },
        { status: 403 },
      );
    }

    const statusId = await ensureOrderStatus(
      "en_preparacion",
      "Pedido en preparación",
      2,
      false,
      connection,
    );

    await connection.query(
      `
        UPDATE orders
        SET order_status_id = ?, updated_at = NOW()
        WHERE id = ? AND business_id = ?
      `,
      [statusId, orderId, businessId],
    );

    return NextResponse.json({
      success: true,
      message: "Pedido actualizado a preparación",
    });
  } catch (error) {
    console.error("Error PATCH /api/business/orders/[id]/status:", error);
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "No se pudo actualizar el pedido.",
      },
      { status: 500 },
    );
  } finally {
    connection.release();
  }
}
