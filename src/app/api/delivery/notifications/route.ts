import type { RowDataPacket } from "mysql2/promise";
import { type NextRequest, NextResponse } from "next/server";

import { getAuthUser } from "@/lib/admin-security";
import pool, { logDbUsage } from "@/lib/db";
import { ensureNotificationsTable } from "@/lib/notifications";
import { ensureSupportTables } from "@/lib/support";

type UserInfoRow = RowDataPacket & {
  email: string;
  role_name: string | null;
};

type NotificationRow = RowDataPacket & {
  id: number;
  type: string;
  title: string;
  message: string;
  related_id: number | null;
  is_read: number | boolean | null;
  created_at: string;
};

type DeliveryOrderNotificationRow = RowDataPacket & {
  order_id: number;
  order_status: string | null;
  assigned_at: string | null;
  created_at: string;
};

type DeliveryTipNotificationRow = RowDataPacket & {
  id: number;
  order_id: number;
  amount: string | number | null;
  created_at: string;
};

type AdminMessageNotificationRow = RowDataPacket & {
  id: number;
  order_id: number;
  type: string;
  message: string;
  created_at: string;
};

type SupportMessageNotificationRow = RowDataPacket & {
  id: number;
  order_id: number | null;
  sender_type: string;
  message: string;
  message_type: string;
  created_at: string;
};

type OrderFolioRow = RowDataPacket & {
  order_id: number;
  folio: string;
};

type DeliveryNotificationPayload = {
  id: string;
  title: string;
  message: string;
  type: string;
  status: string | null;
  createdAt: string;
  isRead: boolean;
  orderId: number | null;
  folio: string | null;
};

function normalizeStatus(value: unknown) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, "_");
}

function humanizeStatus(value: unknown) {
  const normalized = normalizeStatus(value);

  if (normalized === "en_camino") return "En camino";
  if (normalized === "en_entrega") return "En entrega";
  if (normalized === "listo_para_recoger") return "Listo para recoger";
  if (normalized === "recogido") return "Recogido";
  if (normalized === "preparando") return "Preparando";
  if (normalized === "pendiente") return "Pendiente";

  return String(value ?? "Pendiente");
}

function buildFolio(orderId: number) {
  return `FG-${String(orderId).padStart(4, "0")}`;
}

function isNonEmptyString(value: string | null): value is string {
  return typeof value === "string" && value.length > 0;
}

export async function GET(req: NextRequest) {
  try {
    const authUser = getAuthUser(req);

    if (!authUser?.token) {
      return NextResponse.json(
        { success: false, error: "Token faltante", notifications: [] },
        { status: 401 },
      );
    }

    if (!authUser?.user) {
      return NextResponse.json(
        { success: false, error: "Token inválido", notifications: [] },
        { status: 401 },
      );
    }

    const userId = authUser.user.id;

    const [userInfoRows] = await pool.query<UserInfoRow[]>(
      `
        SELECT u.email, r.name AS role_name
        FROM users u
        LEFT JOIN user_roles ur ON ur.user_id = u.id
        LEFT JOIN roles r ON r.id = ur.role_id
        WHERE u.id = ?
      `,
      [userId],
    );

    const email = userInfoRows[0]?.email ?? null;
    const roles = userInfoRows
      .map((row) => row.role_name)
      .filter(isNonEmptyString);

    console.log(
      "GET /api/delivery/notifications endpoint:",
      "/api/delivery/notifications",
    );
    console.log("GET /api/delivery/notifications userId:", userId);
    console.log("GET /api/delivery/notifications email:", email);
    console.log("GET /api/delivery/notifications role:", roles);
    logDbUsage("/api/delivery/notifications", {
      userId,
      email,
      role: roles,
    });

    await ensureNotificationsTable();
    await ensureSupportTables();

    const [
      notificationRowsResult,
      deliveryRowsResult,
      tipRowsResult,
      adminMessageRowsResult,
      supportMessageRowsResult,
      folioRowsResult,
    ] = await Promise.all([
      pool.query<NotificationRow[]>(
        `
          SELECT id, type, title, message, related_id, is_read, created_at
          FROM notifications
          WHERE user_id = ?
          ORDER BY created_at DESC, id DESC
          LIMIT 10
        `,
        [userId],
      ),
      pool.query<DeliveryOrderNotificationRow[]>(
        `
          SELECT
            o.id AS order_id,
            osc.name AS order_status,
            COALESCE(d.assigned_at, d.created_at, o.created_at) AS assigned_at,
            o.created_at
          FROM delivery d
          INNER JOIN orders o ON o.id = d.order_id
          LEFT JOIN order_status_catalog osc ON osc.id = o.order_status_id
          LEFT JOIN delivery_status_catalog dsc ON dsc.id = d.delivery_status_id
          WHERE d.driver_user_id = ?
            AND COALESCE(dsc.is_final, 0) = 0
          ORDER BY COALESCE(d.assigned_at, d.created_at, o.created_at) DESC
          LIMIT 10
        `,
        [userId],
      ),
      pool.query<DeliveryTipNotificationRow[]>(
        `
          SELECT id, order_id, amount, created_at
          FROM delivery_tips
          WHERE driver_user_id = ?
          ORDER BY created_at DESC
          LIMIT 10
        `,
        [userId],
      ),
      pool.query<AdminMessageNotificationRow[]>(
        `
          SELECT am.id, am.order_id, am.type, am.message, am.created_at
          FROM admin_messages am
          INNER JOIN delivery d ON d.order_id = am.order_id
          WHERE d.driver_user_id = ?
          ORDER BY am.created_at DESC
          LIMIT 10
        `,
        [userId],
      ),
      pool.query<SupportMessageNotificationRow[]>(
        `
          SELECT
            sm.id,
            st.order_id,
            sm.sender_type,
            sm.message,
            sm.message_type,
            sm.created_at
          FROM support_messages sm
          INNER JOIN support_threads st ON st.id = sm.thread_id
          INNER JOIN delivery d ON d.order_id = st.order_id
          WHERE d.driver_user_id = ?
            AND sm.sender_type IN ('admin', 'system')
          ORDER BY sm.created_at DESC
          LIMIT 10
        `,
        [userId],
      ),
      pool.query<OrderFolioRow[]>(
        `
          SELECT DISTINCT
            o.id AS order_id,
            CONCAT('FG-', LPAD(o.id, 4, '0')) AS folio
          FROM delivery d
          INNER JOIN orders o ON o.id = d.order_id
          WHERE d.driver_user_id = ?
        `,
        [userId],
      ),
    ]);

    const [notificationRows] = notificationRowsResult;
    const [deliveryRows] = deliveryRowsResult;
    const [tipRows] = tipRowsResult;
    const [adminMessageRows] = adminMessageRowsResult;
    const [supportMessageRows] = supportMessageRowsResult;
    const [folioRows] = folioRowsResult;

    const folioByOrderId = new Map<number, string>();
    for (const row of folioRows) {
      folioByOrderId.set(Number(row.order_id), String(row.folio));
    }

    const notifications: DeliveryNotificationPayload[] = [
      ...notificationRows.map((row) => ({
        id: `notification-${row.id}`,
        title: String(row.title),
        message: String(row.message),
        type: String(row.type),
        status: null,
        createdAt: String(row.created_at),
        isRead: Boolean(row.is_read),
        orderId:
          row.related_id === null || row.related_id === undefined
            ? null
            : Number(row.related_id),
        folio:
          row.related_id === null || row.related_id === undefined
            ? null
            : (folioByOrderId.get(Number(row.related_id)) ??
              buildFolio(Number(row.related_id))),
      })),
      ...deliveryRows.map((row) => ({
        id: `delivery-order-${row.order_id}`,
        title: `Pedido asignado ${folioByOrderId.get(Number(row.order_id)) ?? buildFolio(Number(row.order_id))}`,
        message: `Estado actual: ${humanizeStatus(row.order_status)}.`,
        type: "pedido",
        status: humanizeStatus(row.order_status),
        createdAt: String(row.assigned_at ?? row.created_at),
        isRead: true,
        orderId: Number(row.order_id),
        folio:
          folioByOrderId.get(Number(row.order_id)) ??
          buildFolio(Number(row.order_id)),
      })),
      ...tipRows.map((row) => ({
        id: `delivery-tip-${row.id}`,
        title: "Propina registrada",
        message: `Recibiste una propina de $${Number(row.amount ?? 0).toFixed(2)} MXN.`,
        type: "pago",
        status: "Propina",
        createdAt: String(row.created_at),
        isRead: true,
        orderId: Number(row.order_id),
        folio:
          folioByOrderId.get(Number(row.order_id)) ??
          buildFolio(Number(row.order_id)),
      })),
      ...adminMessageRows.map((row) => ({
        id: `admin-message-${row.id}`,
        title: "Mensaje del administrador",
        message: String(row.message),
        type: row.type === "payment_proof" ? "pago" : "soporte",
        status: row.type,
        createdAt: String(row.created_at),
        isRead: true,
        orderId: Number(row.order_id),
        folio:
          folioByOrderId.get(Number(row.order_id)) ??
          buildFolio(Number(row.order_id)),
      })),
      ...supportMessageRows.map((row) => ({
        id: `support-message-${row.id}`,
        title:
          row.sender_type === "system"
            ? "Actualización del sistema"
            : "Soporte respondió",
        message: String(row.message),
        type: row.message_type === "payment_proof" ? "pago" : "soporte",
        status: row.sender_type,
        createdAt: String(row.created_at),
        isRead: true,
        orderId:
          row.order_id === null || row.order_id === undefined
            ? null
            : Number(row.order_id),
        folio:
          row.order_id === null || row.order_id === undefined
            ? null
            : (folioByOrderId.get(Number(row.order_id)) ??
              buildFolio(Number(row.order_id))),
      })),
    ]
      .sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      )
      .slice(0, 10);

    return NextResponse.json({
      success: true,
      notifications,
    });
  } catch (error) {
    console.error("Error GET /api/delivery/notifications:", error);
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "No se pudieron cargar las notificaciones del repartidor.",
        notifications: [],
      },
      { status: 500 },
    );
  }
}
