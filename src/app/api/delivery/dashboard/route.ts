import type { RowDataPacket } from "mysql2/promise";
import { type NextRequest, NextResponse } from "next/server";

import { getAuthUser } from "@/lib/admin-security";
import pool, { logDbUsage } from "@/lib/db";
import { resolveDeliveryAccess } from "@/lib/delivery-access";

type DeliveryDashboardRow = RowDataPacket & {
  order_id: number;
  business_name: string;
  customer_name: string | null;
  street: string | null;
  external_number: string | null;
  internal_number: string | null;
  neighborhood: string | null;
  city: string | null;
  state: string | null;
  total_amount: string | number | null;
  order_status: string | null;
  delivery_status: string | null;
  delivered_at: string | null;
};

const ACTIVE_DELIVERY_STATUSES = new Set([
  "pendiente",
  "pendiente_aceptacion",
  "aceptado",
  "en_camino",
  "repartidor_asignado",
  "listo_para_recoger",
]);

const COMPLETED_DELIVERY_STATUSES = new Set([
  "completado",
  "entregado",
  "pedido_entregado",
]);

function normalizeStatus(value: unknown) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, "_");
}

function buildAddress(row: DeliveryDashboardRow) {
  return [
    row.street?.trim(),
    row.external_number?.trim(),
    row.internal_number?.trim() ? `Int. ${row.internal_number.trim()}` : null,
    row.neighborhood?.trim(),
    row.city?.trim(),
    row.state?.trim(),
  ]
    .filter(Boolean)
    .join(", ");
}

function isToday(value: string | null) {
  if (!value) return false;

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return false;

  const now = new Date();

  return (
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate()
  );
}

export async function GET(req: NextRequest) {
  try {
    const authUser = getAuthUser(req);

    if (!authUser?.token) {
      return NextResponse.json(
        { success: false, error: "Token faltante", dashboard: null },
        { status: 401 },
      );
    }

    if (!authUser?.user) {
      return NextResponse.json(
        { success: false, error: "Token inválido", dashboard: null },
        { status: 401 },
      );
    }

    const userId = authUser.user.id;
    const access = await resolveDeliveryAccess(userId);

    if (!access.allowed) {
      return NextResponse.json(
        {
          success: false,
          error: "No autorizado para acceder al panel de repartidor",
          dashboard: null,
          stats: null,
        },
        { status: 403 },
      );
    }

    logDbUsage("/api/delivery/dashboard", {
      userId,
      email: access.email,
      role: access.roles,
    });

    const [rows] = await pool.query<DeliveryDashboardRow[]>(
      `
        SELECT
          o.id AS order_id,
          b.name AS business_name,
          TRIM(CONCAT_WS(' ', u.first_name, u.last_name)) AS customer_name,
          a.street,
          a.external_number,
          a.internal_number,
          a.neighborhood,
          a.city,
          a.state,
          o.total_amount,
          osc.name AS order_status,
          dsc.name AS delivery_status,
          COALESCE(d.delivered_at, o.delivered_at) AS delivered_at
        FROM delivery d
        INNER JOIN orders o ON o.id = d.order_id
        INNER JOIN business b ON b.id = o.business_id
        LEFT JOIN users u ON u.id = o.user_id
        LEFT JOIN addresses a ON a.id = o.address_id
        LEFT JOIN order_status_catalog osc ON osc.id = o.order_status_id
        LEFT JOIN delivery_status_catalog dsc ON dsc.id = d.delivery_status_id
        WHERE d.driver_user_id = ?
        ORDER BY o.created_at DESC, d.id DESC
      `,
      [userId],
    );

    const activeAssignments = rows.filter((row) => {
      const deliveryStatus = normalizeStatus(row.delivery_status);
      const orderStatus = normalizeStatus(row.order_status);
      const isCompleted = COMPLETED_DELIVERY_STATUSES.has(deliveryStatus);

      return (
        !row.delivered_at &&
        !isCompleted &&
        (ACTIVE_DELIVERY_STATUSES.has(deliveryStatus) ||
          ACTIVE_DELIVERY_STATUSES.has(orderStatus))
      );
    });

    const completedTodayAssignments = rows.filter((row) => {
      const deliveryStatus = normalizeStatus(row.delivery_status);
      const orderStatus = normalizeStatus(row.order_status);

      return (
        isToday(row.delivered_at) &&
        (COMPLETED_DELIVERY_STATUSES.has(deliveryStatus) ||
          COMPLETED_DELIVERY_STATUSES.has(orderStatus))
      );
    });

    console.log(
      "[delivery-dashboard] asignaciones activas:",
      activeAssignments.map((row) => ({
        orderId: Number(row.order_id),
        orderStatus: row.order_status,
        deliveryStatus: row.delivery_status,
      })),
    );
    console.log(
      "[delivery-dashboard] asignaciones completadas hoy:",
      completedTodayAssignments.map((row) => ({
        orderId: Number(row.order_id),
        deliveredAt: row.delivered_at,
      })),
    );
    console.log("[delivery-dashboard] contador final:", {
      activeDeliveriesCount: activeAssignments.length,
      completedTodayCount: completedTodayAssignments.length,
    });

    const dashboard = {
      activeDeliveriesCount: activeAssignments.length,
      completedTodayCount: completedTodayAssignments.length,
      currentDeliveries: activeAssignments.map((row) => ({
        id: Number(row.order_id),
        businessName: row.business_name,
        customerName: row.customer_name ?? "Cliente",
        address: buildAddress(row),
        total: Number(row.total_amount ?? 0),
        orderStatus: row.order_status ?? "",
        deliveryStatus: row.delivery_status ?? "",
      })),
      completedDeliveriesToday: completedTodayAssignments.map((row) => ({
        id: Number(row.order_id),
        businessName: row.business_name,
        customerName: row.customer_name ?? "Cliente",
        address: buildAddress(row),
        total: Number(row.total_amount ?? 0),
        deliveredAt: row.delivered_at,
      })),
    };

    return NextResponse.json({
      success: true,
      dashboard,
      stats: {
        activeDeliveries: activeAssignments.length,
        completedDeliveries: completedTodayAssignments.length,
        availableDeliveries: 0,
        earnings: 0,
      },
    });
  } catch (error) {
    console.error("Error GET /api/delivery/dashboard:", error);
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "No se pudo cargar el dashboard del repartidor.",
        dashboard: null,
      },
      { status: 500 },
    );
  }
}
