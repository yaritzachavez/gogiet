import type { ResultSetHeader, RowDataPacket } from "mysql2/promise";
import { type NextRequest, NextResponse } from "next/server";

import { getAuthUser } from "@/lib/admin-security";
import { resolveBusinessAccess } from "@/lib/business-panel";
import pool, { logDbUsage } from "@/lib/db";
import { createNotification } from "@/lib/notifications";
import {
  ensureCanonicalOrderStatus,
  ensureCoreOrderStatuses,
} from "@/lib/order-status-server";

type OrderRow = RowDataPacket & {
  id: number;
  business_id: number;
  business_name: string;
  customer_user_id: number;
};

export async function PATCH(
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
    const orderId = Number(id);

    console.log("[business-ready] Marcando pedido listo", orderId);

    if (!Number.isInteger(orderId) || orderId <= 0) {
      return NextResponse.json(
        { success: false, error: "Pedido inválido" },
        { status: 400 },
      );
    }

    const [orderRows] = await pool.query<OrderRow[]>(
      `
        SELECT
          o.id,
          o.business_id,
          o.user_id AS customer_user_id,
          b.name AS business_name
        FROM orders o
        INNER JOIN business b ON b.id = o.business_id
        WHERE o.id = ?
        LIMIT 1
      `,
      [orderId],
    );

    if (!orderRows.length) {
      return NextResponse.json(
        { success: false, error: "Pedido no encontrado" },
        { status: 404 },
      );
    }

    const access = await resolveBusinessAccess(
      authUser.user.id,
      Number(orderRows[0].business_id),
    );
    logDbUsage("/api/business/orders/[id]/ready", {
      userId: access.userId,
      email: access.email,
      role: access.roles,
    });

    if (!access.businessId || !access.businessIds.includes(access.businessId)) {
      return NextResponse.json(
        { success: false, error: "No autorizado para este negocio" },
        { status: 403 },
      );
    }

    await ensureCoreOrderStatuses();
    const { statusId } = await ensureCanonicalOrderStatus("ready_for_pickup");

    await pool.query<ResultSetHeader>(
      `
        UPDATE orders
        SET
          order_status_id = ?,
          confirmed_at = COALESCE(confirmed_at, NOW()),
          updated_at = NOW()
        WHERE id = ?
      `,
      [statusId, orderId],
    );

    console.log("[business-ready] Pedido marcado como listo:", {
      orderId,
      businessId: Number(orderRows[0].business_id),
      orderStatusId: statusId,
    });

    await createNotification({
      userId: Number(orderRows[0].customer_user_id),
      type: "pedido",
      title: `Pedido listo #FG-${String(orderId).padStart(4, "0")}`,
      message: `Tu pedido de ${orderRows[0].business_name} ya está listo para entrega.`,
      relatedId: orderId,
      dataJson: {
        order_id: orderId,
        business_id: Number(orderRows[0].business_id),
        status: "ready_for_pickup",
      },
    });

    return NextResponse.json({
      success: true,
      deliveryRequested: false,
      message: "Pedido listo. Ahora puedes solicitar repartidor.",
    });
  } catch (error) {
    console.error("[business-ready] Error real backend", error);
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "No se pudo marcar el pedido como listo.",
      },
      { status: 500 },
    );
  }
}
