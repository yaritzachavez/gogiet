import type { ResultSetHeader, RowDataPacket } from "mysql2/promise";
import { type NextRequest, NextResponse } from "next/server";

import pool from "@/lib/db";
import { createNotificationsForAdminGeneral } from "@/lib/notifications";
import {
  ensureAdminMessagesRuntimeSchema,
  ensureOrderItemsRuntimeSchema,
  ensureOrdersRuntimeSchema,
} from "@/lib/order-schema";
import {
  getOrderStatusLabel,
  resolveCanonicalOrderStatus,
} from "@/lib/order-status";
import { ensureCoreOrderStatuses } from "@/lib/order-status-server";
import { requireOrderOwnership } from "@/lib/permissions";
import { addSupportMessage, getOrCreateSupportThread } from "@/lib/support";
import { buildUserAvatarSelect, getUserAvatarColumns } from "@/lib/user-avatar";

type RouteContext = {
  params: Promise<{ id: string }>;
};

type AdminMessageRow = RowDataPacket & {
  id: number;
  order_id: number;
  user_id: number;
  type: string;
  message: string;
  file_url: string | null;
  created_at: string;
};

type OrderWithRelations = RowDataPacket & {
  items: RowDataPacket[];
  notes: RowDataPacket[];
  admin_messages: AdminMessageRow[];
};

function normalizeId(value: string) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

async function ensureOrdersColumns() {
  await ensureOrdersRuntimeSchema(pool);
}

async function ensureOrderItemsTable() {
  await ensureOrderItemsRuntimeSchema(pool);
}

async function ensureAdminMessagesTable() {
  await ensureAdminMessagesRuntimeSchema(pool);
}

function normalizeCatalogName(value: unknown, fallback: string) {
  const normalized = String(value ?? "")
    .trim()
    .toLowerCase();

  return normalized || fallback;
}

async function getOrCreateCatalogIdByName(
  table: "order_status_catalog" | "payment_methods",
  name: string,
) {
  const normalizedName = normalizeCatalogName(
    name,
    table === "payment_methods" ? "efectivo" : "pendiente",
  );
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT id FROM ${table} WHERE name = ? LIMIT 1`,
    [normalizedName],
  );

  if (rows[0]?.id) {
    return rows[0].id as number;
  }

  if (table === "payment_methods") {
    const descriptions: Record<string, string> = {
      efectivo: "Pago en efectivo al recibir",
      transferencia: "Transferencia bancaria por validar",
      terminal: "Pago con terminal al recibir",
    };

    const [result] = await pool.query<ResultSetHeader>(
      `
        INSERT INTO payment_methods (
          name,
          description,
          requires_verification,
          is_active,
          created_at,
          updated_at
        )
        VALUES (?, ?, ?, 1, NOW(), NOW())
      `,
      [
        normalizedName,
        descriptions[normalizedName] ?? `Metodo de pago ${normalizedName}`,
        normalizedName === "transferencia" ? 1 : 0,
      ],
    );

    return result.insertId;
  }

  const statusDescriptions: Record<string, string> = {
    pendiente: "Pedido pendiente de preparacion",
    por_validar_pago: "Transferencia recibida pendiente de validacion",
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
      statusDescriptions[normalizedName] ?? `Estado ${normalizedName}`,
      normalizedName === "por_validar_pago" ? 2 : 1,
    ],
  );

  return result.insertId;
}

async function getOrderById(
  orderId: number,
): Promise<OrderWithRelations | null> {
  await ensureOrdersColumns();
  await ensureOrderItemsTable();
  await ensureCoreOrderStatuses();
  await ensureAdminMessagesTable();
  const avatarColumns = await getUserAvatarColumns();
  const courierAvatarSelect = buildUserAvatarSelect(
    "du",
    avatarColumns,
    "delivery_profile_image_url",
  );

  const [orderRows] = await pool.query<RowDataPacket[]>(
    `
      SELECT
        o.id,
        o.user_id,
        TRIM(CONCAT_WS(' ', u.first_name, u.last_name)) AS customer_name,
        u.email AS customer_email,
        u.phone AS customer_phone,
        o.cart_id,
        o.business_id,
        b.name AS business_name,
        o.address_id,
        a.street,
        a.external_number,
        a.neighborhood,
        a.city AS delivery_city,
        o.payment_method_id,
        COALESCE(o.payment_method, pm.name) AS payment_method,
        COALESCE(o.payment_receipt_url, o.comprobante_pago_url) AS payment_receipt_url,
        o.order_status_id,
        osc.name AS status_name,
        o.subtotal,
        o.terminal_fee,
        o.delivery_fee,
        o.service_fee,
        o.platform_fee,
        o.driver_fee,
        o.tip_amount,
        o.discount_amount,
        o.total_amount,
        o.customer_notes,
        o.placed_at,
        o.created_at,
        o.updated_at
        ,
        COALESCE(o.driver_id, d.driver_user_id) AS delivery_user_id,
        TRIM(CONCAT_WS(' ', du.first_name, du.last_name)) AS delivery_name,
        du.phone AS delivery_phone,
        ${courierAvatarSelect},
        dsc.name AS delivery_status
      FROM orders o
      LEFT JOIN users u ON u.id = o.user_id
      LEFT JOIN business b ON b.id = o.business_id
      LEFT JOIN addresses a ON a.id = o.address_id
      LEFT JOIN payment_methods pm ON pm.id = o.payment_method_id
      LEFT JOIN order_status_catalog osc ON osc.id = o.order_status_id
      LEFT JOIN delivery d ON d.order_id = o.id
      LEFT JOIN users du ON du.id = d.driver_user_id
      LEFT JOIN delivery_status_catalog dsc ON dsc.id = d.delivery_status_id
      WHERE o.id = ?
      LIMIT 1
    `,
    [orderId],
  );

  if (!orderRows.length) return null;

  const [items] = await pool.query<RowDataPacket[]>(
    `
      SELECT
        oi.id,
        oi.order_id,
        oi.product_id,
        oi.product_name_snapshot AS product_name,
        oi.quantity,
        oi.unit_price,
        oi.subtotal,
        oi.notes,
        oi.created_at,
        oi.updated_at
      FROM order_items oi
      WHERE oi.order_id = ?
      ORDER BY oi.id ASC
    `,
    [orderId],
  );

  const [notes] = await pool.query<RowDataPacket[]>(
    `
      SELECT id, user_id, note_type, note_text, created_at
      FROM order_notes
      WHERE order_id = ?
      ORDER BY created_at ASC
    `,
    [orderId],
  );

  const [adminMessages] = await pool.query<AdminMessageRow[]>(
    `
      SELECT id, order_id, user_id, type, message, file_url, created_at
      FROM admin_messages
      WHERE order_id = ?
      ORDER BY created_at ASC
    `,
    [orderId],
  );

  return {
    ...orderRows[0],
    items,
    notes,
    admin_messages: adminMessages,
  };
}

export async function GET(req: NextRequest, context: RouteContext) {
  try {
    const { id: idParam } = await context.params;
    const orderId = normalizeId(idParam);

    if (!orderId) {
      return NextResponse.json(
        { success: false, error: "id inválido" },
        { status: 400 },
      );
    }

    const auth = await requireOrderOwnership(req, orderId);

    if (!auth.ok) {
      return auth.response;
    }

    const order = await getOrderById(orderId);

    if (!order) {
      return NextResponse.json(
        { success: false, error: "Pedido no encontrado" },
        { status: 404 },
      );
    }

    return NextResponse.json({
      message: "OK",
      status: resolveCanonicalOrderStatus(order.status_name),
      statusLabel: getOrderStatusLabel(order.status_name),
      order,
    });
  } catch (error) {
    console.error("Error GET /api/orders/:id:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Error interno del servidor",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}

export async function PATCH(req: NextRequest, context: RouteContext) {
  try {
    const { id: idParam } = await context.params;
    const orderId = normalizeId(idParam);

    if (!orderId) {
      return NextResponse.json({ error: "id inválido" }, { status: 400 });
    }

    const auth = await requireOrderOwnership(req, orderId);

    if (!auth.ok) {
      return auth.response;
    }

    const existingOrder = await getOrderById(orderId);

    if (!existingOrder) {
      return NextResponse.json(
        { error: "Pedido no encontrado" },
        { status: 404 },
      );
    }

    const canModifyOrder =
      auth.access.userId === Number(existingOrder.user_id) ||
      auth.access.roles.includes("ADMIN_GENERAL");

    if (!canModifyOrder) {
      return NextResponse.json(
        {
          error:
            "Solo el cliente propietario o el administrador pueden modificar este pedido.",
        },
        { status: 403 },
      );
    }

    const body = await req.json();
    await ensureOrdersColumns();
    await ensureCoreOrderStatuses();
    await ensureAdminMessagesTable();
    const fields: string[] = [];
    const values: Array<string | number | null> = [];

    if (body.status !== undefined || body.nextStatus !== undefined) {
      return NextResponse.json(
        {
          error:
            "El estado del pedido solo puede cambiarse desde el endpoint seguro /api/orders/[id]/status.",
        },
        { status: 403 },
      );
    }

    if (body.payment_method !== undefined) {
      const paymentMethodName = normalizeCatalogName(
        body.payment_method,
        "efectivo",
      );
      const paymentMethodId = await getOrCreateCatalogIdByName(
        "payment_methods",
        paymentMethodName,
      );

      fields.push("payment_method_id = ?");
      values.push(paymentMethodId);
      fields.push("payment_method = ?");
      values.push(paymentMethodName);
    }

    if (
      body.payment_receipt_url !== undefined ||
      body.comprobante_pago_url !== undefined
    ) {
      const receiptUrl =
        String(
          body.payment_receipt_url ?? body.comprobante_pago_url ?? "",
        ).trim() || null;
      fields.push("payment_receipt_url = ?");
      values.push(receiptUrl);
      fields.push("comprobante_pago_url = ?");
      values.push(receiptUrl);
    }

    if (body.customer_notes !== undefined) {
      fields.push("customer_notes = ?");
      values.push(String(body.customer_notes ?? "").trim() || null);
    }

    if (
      !fields.length &&
      body.transfer_receipt_note === undefined &&
      body.comprobante_pago_url === undefined &&
      body.payment_receipt_url === undefined
    ) {
      return NextResponse.json(
        { error: "Nada que actualizar" },
        { status: 400 },
      );
    }

    if (fields.length) {
      fields.push("updated_at = NOW()");
      values.push(orderId);

      await pool.query<ResultSetHeader>(
        `UPDATE orders SET ${fields.join(", ")} WHERE id = ?`,
        values,
      );
    }

    if (body.transfer_receipt_note !== undefined) {
      const noteText = String(body.transfer_receipt_note ?? "").trim();

      if (noteText) {
        await pool.query(
          `
            INSERT INTO order_notes (order_id, user_id, note_type, note_text)
            VALUES (?, ?, 'cliente', ?)
          `,
          [orderId, auth.access.userId, noteText],
        );
      }
    }

    if (
      body.payment_receipt_url !== undefined ||
      body.comprobante_pago_url !== undefined
    ) {
      const proofUrl = String(
        body.payment_receipt_url ?? body.comprobante_pago_url ?? "",
      ).trim();

      if (proofUrl) {
        await pool.query(
          `
            INSERT INTO admin_messages (order_id, user_id, type, message, file_url)
            VALUES (?, ?, 'payment_proof', ?, ?)
          `,
          [
            orderId,
            auth.access.userId,
            "El cliente subió comprobante de transferencia para validar el pago.",
            proofUrl,
          ],
        );

        const supportThreadId = await getOrCreateSupportThread({
          userId: Number(existingOrder.user_id),
          orderId,
        });

        await addSupportMessage({
          threadId: supportThreadId,
          senderId: null,
          senderType: "system",
          message: "Comprobante de transferencia recibido para validar pago.",
          fileUrl: proofUrl,
          messageType: "payment_proof",
        });

        await createNotificationsForAdminGeneral({
          type: "pago",
          title: `Comprobante subido #${orderId}`,
          message:
            "El cliente subió un comprobante de transferencia para validar el pago.",
          relatedId: orderId,
        });
      }
    }

    const order = await getOrderById(orderId);
    return NextResponse.json({ message: "Pedido actualizado", order });
  } catch (error) {
    console.error("Error PATCH /api/orders/:id:", error);
    return NextResponse.json(
      {
        error: "Error interno del servidor",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}
