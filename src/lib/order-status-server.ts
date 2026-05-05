import type { Pool, PoolConnection } from "mysql2/promise";

import { ensureOrderStatus } from "@/lib/business-panel";
import pool from "@/lib/db";
import {
  type CanonicalOrderStatus,
  resolveCanonicalOrderStatus,
} from "@/lib/order-status";

type Queryable = Pool | PoolConnection;

const ORDER_STATUS_META: Record<
  CanonicalOrderStatus,
  { description: string; sortOrder: number; isFinal: boolean }
> = {
  pending: {
    description: "Pedido pendiente de atención",
    sortOrder: 1,
    isFinal: false,
  },
  payment_review: {
    description: "Pago pendiente de validación",
    sortOrder: 2,
    isFinal: false,
  },
  accepted: {
    description: "Pedido aceptado",
    sortOrder: 3,
    isFinal: false,
  },
  preparing: {
    description: "Pedido en preparación",
    sortOrder: 4,
    isFinal: false,
  },
  ready_for_pickup: {
    description: "Pedido listo para recoger",
    sortOrder: 5,
    isFinal: false,
  },
  delivery_requested: {
    description: "Se solicitó repartidor para el pedido",
    sortOrder: 6,
    isFinal: false,
  },
  driver_assigned: {
    description: "Pedido con repartidor asignado",
    sortOrder: 7,
    isFinal: false,
  },
  on_the_way: {
    description: "Pedido en camino al cliente",
    sortOrder: 8,
    isFinal: false,
  },
  delivered: {
    description: "Pedido entregado",
    sortOrder: 9,
    isFinal: true,
  },
  cancelled: {
    description: "Pedido cancelado",
    sortOrder: 99,
    isFinal: true,
  },
};

export async function ensureCanonicalOrderStatus(
  value: unknown,
  executor: Queryable = pool,
) {
  const canonical = resolveCanonicalOrderStatus(value);
  const meta = ORDER_STATUS_META[canonical];
  const statusId = await ensureOrderStatus(
    canonical,
    meta.description,
    meta.sortOrder,
    meta.isFinal,
    executor,
  );

  return { statusId, canonical };
}

export async function ensureCoreOrderStatuses(executor: Queryable = pool) {
  for (const status of Object.keys(
    ORDER_STATUS_META,
  ) as CanonicalOrderStatus[]) {
    await ensureCanonicalOrderStatus(status, executor);
  }
}
