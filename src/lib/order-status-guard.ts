import type { Pool, PoolConnection, ResultSetHeader, RowDataPacket } from "mysql2/promise";

import { ensureCanonicalOrderStatus } from "@/lib/order-status-server";
import {
  type CanonicalOrderStatus,
  resolveCanonicalOrderStatus,
} from "@/lib/order-status";

type Queryable = Pool | PoolConnection;

export type OrderActorRole =
  | "client"
  | "business"
  | "driver"
  | "admin"
  | "system";

export type GuardedOrderRow = {
  id: number;
  businessId: number;
  customerUserId: number;
  driverUserId: number | null;
  paymentMethod: string | null;
  currentStatus: string | null;
};

type OrderStatusHistoryRow = RowDataPacket & {
  Field: string;
};

export class OrderStatusTransitionError extends Error {
  statusCode: number;

  constructor(message: string, statusCode = 409) {
    super(message);
    this.name = "OrderStatusTransitionError";
    this.statusCode = statusCode;
  }
}

const OPERATIONAL_FLOW: CanonicalOrderStatus[] = [
  "pending_payment",
  "paid",
  "accepted",
  "preparing",
  "ready_for_pickup",
  "driver_assigned",
  "on_the_way",
  "delivered",
];

const PRE_ACCEPTANCE_CANCELABLE = new Set<CanonicalOrderStatus>([
  "pending_payment",
  "paid",
  "pending",
  "payment_review",
]);

function normalizePaymentMethod(value: unknown) {
  return String(value ?? "")
    .trim()
    .toLowerCase();
}

function isTerminalStatus(status: CanonicalOrderStatus) {
  return (
    status === "cancelled" ||
    status === "delivered" ||
    status === "payment_failed"
  );
}

function getOperationalIndex(status: CanonicalOrderStatus) {
  return OPERATIONAL_FLOW.indexOf(status);
}

function isLegacyPaidEquivalent(
  status: CanonicalOrderStatus,
  paymentMethod: string | null,
) {
  const method = normalizePaymentMethod(paymentMethod);
  return (
    status === "pending" &&
    (method === "efectivo" || method === "terminal" || method === "cash")
  );
}

function ensureSameStepAdvance(
  currentStatus: CanonicalOrderStatus,
  nextStatus: CanonicalOrderStatus,
  paymentMethod: string | null,
) {
  const effectiveCurrentStatus = isLegacyPaidEquivalent(
    currentStatus,
    paymentMethod,
  )
    ? "paid"
    : currentStatus;
  const currentIndex = getOperationalIndex(effectiveCurrentStatus);
  const nextIndex = getOperationalIndex(nextStatus);

  if (currentIndex === -1 || nextIndex === -1) {
    throw new OrderStatusTransitionError(
      "La transición solicitada no es válida para el flujo operativo del pedido.",
    );
  }

  if (nextIndex !== currentIndex + 1) {
    throw new OrderStatusTransitionError(
      "No puedes brincar pasos en el flujo del pedido.",
    );
  }
}

export function validateOrderStatusTransition(params: {
  currentStatus: unknown;
  nextStatus: unknown;
  role: OrderActorRole;
  order: GuardedOrderRow;
  actorUserId: number;
  reason?: string | null;
}) {
  const currentStatus = resolveCanonicalOrderStatus(params.currentStatus);
  const nextStatus = resolveCanonicalOrderStatus(params.nextStatus);
  const { order, role, actorUserId } = params;
  const reason = String(params.reason ?? "").trim();

  if (currentStatus === nextStatus) {
    throw new OrderStatusTransitionError(
      "El pedido ya se encuentra en ese estado.",
      409,
    );
  }

  if (currentStatus === "cancelled") {
    throw new OrderStatusTransitionError(
      "El pedido fue cancelado y no puede volver a estados activos.",
      409,
    );
  }

  if (currentStatus === "delivered") {
    throw new OrderStatusTransitionError(
      "Este pedido ya fue entregado y no puede modificarse.",
      409,
    );
  }

  if (currentStatus === "payment_failed") {
    throw new OrderStatusTransitionError(
      "Un pedido con pago fallido no puede avanzar.",
      409,
    );
  }

  if (role === "client") {
    if (actorUserId !== Number(order.customerUserId)) {
      throw new OrderStatusTransitionError(
        "No puedes modificar pedidos de otro cliente.",
        403,
      );
    }

    if (nextStatus !== "cancelled") {
      throw new OrderStatusTransitionError(
        "El cliente no puede cambiar estados internos del pedido.",
        403,
      );
    }

    if (!PRE_ACCEPTANCE_CANCELABLE.has(currentStatus)) {
      throw new OrderStatusTransitionError(
        "Solo puedes cancelar el pedido antes de que el negocio lo acepte.",
        409,
      );
    }

    return {
      currentStatus,
      nextStatus,
      changedByRole: role,
    };
  }

  if (role === "business") {
    if (nextStatus === "paid") {
      throw new OrderStatusTransitionError(
        "El negocio no puede validar pagos.",
        403,
      );
    }

    if (
      nextStatus !== "accepted" &&
      nextStatus !== "preparing" &&
      nextStatus !== "ready_for_pickup"
    ) {
      throw new OrderStatusTransitionError(
        "El negocio solo puede avanzar estados operativos de su pedido.",
        403,
      );
    }

    ensureSameStepAdvance(currentStatus, nextStatus, order.paymentMethod);

    if (nextStatus === "accepted" && !isLegacyPaidEquivalent(currentStatus, order.paymentMethod) && currentStatus !== "paid") {
      throw new OrderStatusTransitionError(
        "El pedido debe estar pagado antes de ser aceptado.",
      );
    }

    return {
      currentStatus,
      nextStatus,
      changedByRole: role,
    };
  }

  if (role === "driver") {
    if (Number(order.driverUserId ?? 0) !== actorUserId) {
      throw new OrderStatusTransitionError(
        "El repartidor no está asignado a este pedido.",
        403,
      );
    }

    if (
      nextStatus !== "driver_assigned" &&
      nextStatus !== "on_the_way" &&
      nextStatus !== "delivered"
    ) {
      throw new OrderStatusTransitionError(
        "El repartidor solo puede aceptar, recoger o entregar pedidos asignados.",
        403,
      );
    }

    ensureSameStepAdvance(currentStatus, nextStatus, order.paymentMethod);

    if (nextStatus === "driver_assigned" && currentStatus !== "ready_for_pickup") {
      throw new OrderStatusTransitionError(
        "Solo puedes aceptar pedidos que ya estén listos para recoger.",
      );
    }

    if (nextStatus === "on_the_way" && currentStatus !== "driver_assigned") {
      throw new OrderStatusTransitionError(
        "No puedes marcar como recogido un pedido sin repartidor asignado.",
      );
    }

    if (nextStatus === "delivered" && currentStatus !== "on_the_way") {
      throw new OrderStatusTransitionError(
        "No puedes marcar como entregado un pedido que aún no fue recogido.",
      );
    }

    return {
      currentStatus,
      nextStatus,
      changedByRole: role,
    };
  }

  if (role === "admin") {
    if (nextStatus === "cancelled" && !reason) {
      throw new OrderStatusTransitionError(
        "Debes indicar un motivo para cancelar el pedido.",
        409,
      );
    }

    if (nextStatus === "paid") {
      if (
        currentStatus !== "pending_payment" &&
        currentStatus !== "payment_review" &&
        currentStatus !== "pending"
      ) {
        throw new OrderStatusTransitionError(
          "Solo puedes validar pagos pendientes.",
          409,
        );
      }

      return {
        currentStatus,
        nextStatus,
        changedByRole: role,
      };
    }

    if (nextStatus === "cancelled") {
      return {
        currentStatus,
        nextStatus,
        changedByRole: role,
      };
    }

    ensureSameStepAdvance(currentStatus, nextStatus, order.paymentMethod);

    return {
      currentStatus,
      nextStatus,
      changedByRole: role,
    };
  }

  if (role === "system") {
    if (nextStatus === "paid") {
      if (
        currentStatus !== "pending_payment" &&
        currentStatus !== "payment_review" &&
        currentStatus !== "pending"
      ) {
        throw new OrderStatusTransitionError(
          "Solo se pueden confirmar pagos pendientes automáticamente.",
          409,
        );
      }

      return {
        currentStatus,
        nextStatus,
        changedByRole: role,
      };
    }

    if (nextStatus === "pending_payment" || nextStatus === "payment_failed") {
      return {
        currentStatus,
        nextStatus,
        changedByRole: role,
      };
    }

    throw new OrderStatusTransitionError(
      "El sistema no puede forzar esa transición del pedido.",
      403,
    );
  }

  throw new OrderStatusTransitionError(
    "No tienes permiso para modificar este pedido.",
    403,
  );
}

export async function ensureOrderStatusHistoryTable(conn: Queryable) {
  await conn.query(
    `
      CREATE TABLE IF NOT EXISTS order_status_history (
        id INT AUTO_INCREMENT PRIMARY KEY,
        order_id INT NOT NULL,
        from_status VARCHAR(50) NOT NULL,
        to_status VARCHAR(50) NOT NULL,
        changed_by_user_id INT NOT NULL,
        changed_by_role VARCHAR(30) NOT NULL,
        reason TEXT NULL,
        metadata MEDIUMTEXT NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_order_status_history_order_id (order_id),
        INDEX idx_order_status_history_changed_by_user_id (changed_by_user_id)
      )
    `,
  );
}

export async function recordOrderStatusHistory(
  conn: Queryable,
  params: {
    orderId: number;
    fromStatus: CanonicalOrderStatus;
    toStatus: CanonicalOrderStatus;
    changedByUserId: number;
    changedByRole: OrderActorRole;
    reason?: string | null;
    metadata?: unknown;
  },
) {
  await ensureOrderStatusHistoryTable(conn);

  await conn.query<ResultSetHeader>(
    `
      INSERT INTO order_status_history (
        order_id,
        from_status,
        to_status,
        changed_by_user_id,
        changed_by_role,
        reason,
        metadata,
        created_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, NOW())
    `,
    [
      params.orderId,
      params.fromStatus,
      params.toStatus,
      params.changedByUserId,
      params.changedByRole,
      params.reason?.trim() || null,
      params.metadata == null ? null : JSON.stringify(params.metadata),
    ],
  );
}

export async function applyValidatedOrderStatusTransition(
  conn: Queryable,
  params: {
    orderId: number;
    nextStatus: CanonicalOrderStatus;
    actorUserId: number;
    actorRole: OrderActorRole;
    currentStatus: CanonicalOrderStatus;
    reason?: string | null;
    metadata?: unknown;
  },
) {
  const { statusId } = await ensureCanonicalOrderStatus(params.nextStatus, conn);
  const fields = ["order_status_id = ?", "updated_at = NOW()"];
  const values: Array<number> = [statusId];

  if (
    params.nextStatus === "accepted" ||
    params.nextStatus === "preparing" ||
    params.nextStatus === "ready_for_pickup"
  ) {
    fields.push("confirmed_at = COALESCE(confirmed_at, NOW())");
  }

  if (params.nextStatus === "delivered") {
    fields.push("delivered_at = COALESCE(delivered_at, NOW())");
  }

  if (params.nextStatus === "cancelled") {
    fields.push("cancelled_at = COALESCE(cancelled_at, NOW())");
  }

  if (params.nextStatus === "paid") {
    fields.push("paid_at = COALESCE(paid_at, NOW())");
  }

  values.push(params.orderId);

  await conn.query<ResultSetHeader>(
    `UPDATE orders SET ${fields.join(", ")} WHERE id = ?`,
    values,
  );

  await recordOrderStatusHistory(conn, {
    orderId: params.orderId,
    fromStatus: params.currentStatus,
    toStatus: params.nextStatus,
    changedByUserId: params.actorUserId,
    changedByRole: params.actorRole,
    reason: params.reason,
    metadata: params.metadata,
  });

  return statusId;
}
