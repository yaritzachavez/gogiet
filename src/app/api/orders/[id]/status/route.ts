import type { ResultSetHeader, RowDataPacket } from "mysql2/promise";
import { type NextRequest, NextResponse } from "next/server";

import { getAuthUser, isAdminGeneral } from "@/lib/admin-security";
import { resolveBusinessAccess } from "@/lib/business-panel";
import pool from "@/lib/db";
import { createNotification } from "@/lib/notifications";
import {
  type CanonicalOrderStatus,
  getOrderStatusLabel,
  resolveCanonicalOrderStatus,
} from "@/lib/order-status";
import {
  ensureCanonicalOrderStatus,
  ensureCoreOrderStatuses,
} from "@/lib/order-status-server";

type OrderRow = RowDataPacket & {
  id: number;
  business_id: number;
  business_name: string;
  customer_user_id: number;
  current_status: string | null;
  driver_user_id: number | null;
};

function getStatusNotificationCopy(
  status: CanonicalOrderStatus,
  orderId: number,
  businessName: string,
) {
  const folio = `#FG-${String(orderId).padStart(4, "0")}`;

  switch (status) {
    case "accepted":
      return {
        title: `Pedido aceptado ${folio}`,
        message: `${businessName} aceptó tu pedido y pronto comenzará a prepararlo.`,
      };
    case "preparing":
      return {
        title: `Pedido en preparación ${folio}`,
        message: `${businessName} ya está preparando tu pedido.`,
      };
    case "ready_for_pickup":
      return {
        title: `Pedido listo ${folio}`,
        message: `Tu pedido de ${businessName} ya está listo para salir a entrega.`,
      };
    case "delivered":
      return {
        title: `Pedido entregado ${folio}`,
        message: `Tu pedido de ${businessName} fue marcado como entregado.`,
      };
    default:
      return null;
  }
}

const BUSINESS_ALLOWED_STATUSES: CanonicalOrderStatus[] = [
  "accepted",
  "preparing",
  "ready_for_pickup",
  "delivery_requested",
  "cancelled",
];

const DRIVER_ALLOWED_STATUSES: CanonicalOrderStatus[] = [
  "driver_assigned",
  "on_the_way",
  "delivered",
];

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const connection = await pool.getConnection();

  try {
    const auth = getAuthUser(req);

    if (!auth?.token) {
      return NextResponse.json(
        { success: false, error: "Token faltante" },
        { status: 401 },
      );
    }

    if (!auth?.user) {
      return NextResponse.json(
        { success: false, error: "Token inválido" },
        { status: 401 },
      );
    }

    const { id } = await context.params;
    const orderId = Number(id);
    const body = await req.json().catch(() => null);
    const requestedStatus = resolveCanonicalOrderStatus(body?.status);

    if (!Number.isInteger(orderId) || orderId <= 0) {
      return NextResponse.json(
        { success: false, error: "Pedido inválido" },
        { status: 400 },
      );
    }

    await ensureCoreOrderStatuses(connection);

    const [orderRows] = await connection.query<OrderRow[]>(
      `
        SELECT
          o.id,
          o.business_id,
          b.name AS business_name,
          o.user_id AS customer_user_id,
          osc.name AS current_status,
          d.driver_user_id
        FROM orders o
        INNER JOIN businesses b ON b.id = o.business_id
        LEFT JOIN order_status_catalog osc ON osc.id = o.order_status_id
        LEFT JOIN delivery d ON d.order_id = o.id
        WHERE o.id = ?
        LIMIT 1
      `,
      [orderId],
    );

    const order = orderRows[0];

    if (!order) {
      return NextResponse.json(
        { success: false, error: "Pedido no encontrado" },
        { status: 404 },
      );
    }

    const admin = await isAdminGeneral(auth.user.id);
    const businessAccess = await resolveBusinessAccess(
      auth.user.id,
      Number(order.business_id),
    );
    const isBusinessActor = businessAccess.businessIds.includes(
      Number(order.business_id),
    );
    const isAssignedDriver = Number(order.driver_user_id ?? 0) === auth.user.id;

    if (!admin) {
      if (isBusinessActor) {
        if (!BUSINESS_ALLOWED_STATUSES.includes(requestedStatus)) {
          return NextResponse.json(
            {
              success: false,
              error: "Tu rol no puede mover el pedido a ese estado",
            },
            { status: 403 },
          );
        }
      } else if (isAssignedDriver) {
        if (!DRIVER_ALLOWED_STATUSES.includes(requestedStatus)) {
          return NextResponse.json(
            {
              success: false,
              error: "Tu rol no puede mover el pedido a ese estado",
            },
            { status: 403 },
          );
        }
      } else {
        return NextResponse.json(
          {
            success: false,
            error: "No autorizado para cambiar este pedido",
          },
          { status: 403 },
        );
      }
    }

    const { statusId, canonical } = await ensureCanonicalOrderStatus(
      requestedStatus,
      connection,
    );
    const previousStatus = resolveCanonicalOrderStatus(order.current_status);

    const fields = ["order_status_id = ?", "updated_at = NOW()"];
    const values: Array<number> = [statusId];

    if (canonical === "accepted" || canonical === "preparing") {
      fields.push("confirmed_at = COALESCE(confirmed_at, NOW())");
    }

    if (canonical === "delivered") {
      fields.push("delivered_at = COALESCE(delivered_at, NOW())");
    }

    if (canonical === "cancelled") {
      fields.push("cancelled_at = COALESCE(cancelled_at, NOW())");
    }

    values.push(orderId);

    await connection.query<ResultSetHeader>(
      `UPDATE orders SET ${fields.join(", ")} WHERE id = ?`,
      values,
    );

    const notificationCopy =
      previousStatus !== canonical
        ? getStatusNotificationCopy(
            canonical,
            orderId,
            String(order.business_name ?? "tu negocio"),
          )
        : null;

    if (notificationCopy) {
      await createNotification(
        {
          userId: Number(order.customer_user_id),
          type: "pedido",
          title: notificationCopy.title,
          message: notificationCopy.message,
          relatedId: orderId,
          dataJson: {
            order_id: orderId,
            business_id: Number(order.business_id),
            status: canonical,
            previous_status: previousStatus,
          },
        },
        connection,
      );
    }

    return NextResponse.json({
      success: true,
      orderId,
      status: canonical,
      statusLabel: getOrderStatusLabel(canonical),
      previousStatus,
    });
  } catch (error) {
    console.error("Error PATCH /api/orders/[id]/status:", error);
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "No se pudo actualizar el estado del pedido.",
      },
      { status: 500 },
    );
  } finally {
    connection.release();
  }
}
