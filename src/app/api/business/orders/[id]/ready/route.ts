import type { ResultSetHeader, RowDataPacket } from "mysql2/promise";
import { type NextRequest, NextResponse } from "next/server";

import { getAuthUser } from "@/lib/admin-security";
import { ensureOrderStatus, resolveBusinessAccess } from "@/lib/business-panel";
import pool, { logDbUsage } from "@/lib/db";
import {
  DeliveryAssignmentError,
  requestCourierAssignment,
} from "@/lib/delivery-assignments";

type OrderRow = RowDataPacket & {
  id: number;
  business_id: number;
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
        SELECT id, business_id
        FROM orders
        WHERE id = ?
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

    const statusId = await ensureOrderStatus(
      "listo_para_recoger",
      "Pedido listo para que el repartidor lo recoja",
      4,
    );

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

    try {
      const result = await requestCourierAssignment({
        orderId,
        userId: authUser.user.id,
      });

      console.log("[business-ready] Respuesta backend", {
        orderId,
        deliveryRequested: true,
        result,
      });

      return NextResponse.json({
        success: true,
        deliveryRequested: true,
        delivery_user_id: result.courierId,
        delivery_name: result.courierName,
        delivery_phone: result.courierPhone,
        delivery_profile_image_url: result.courierAvatarUrl,
        message: result.message,
        data: result,
      });
    } catch (error) {
      if (
        error instanceof DeliveryAssignmentError &&
        error.message ===
          "Este pedido ya tiene un repartidor asignado o pendiente de respuesta."
      ) {
        return NextResponse.json({
          success: true,
          deliveryRequested: true,
          message:
            "Pedido listo. Ya existía una solicitud de repartidor activa.",
        });
      }

      if (error instanceof DeliveryAssignmentError) {
        console.error("[business-ready] Error real backend", {
          orderId,
          error: error.message,
          status: error.status,
          debug: error.debug,
        });

        return NextResponse.json({
          success: false,
          error: error.message,
          debug: error.debug ?? null,
        });
      }

      throw error;
    }
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
