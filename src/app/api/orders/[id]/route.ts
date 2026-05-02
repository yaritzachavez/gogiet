import jwt from "jsonwebtoken";
import type { ResultSetHeader, RowDataPacket } from "mysql2/promise";
import { type NextRequest, NextResponse } from "next/server";

import pool from "@/lib/db";
import { createNotificationsForAdminGeneral } from "@/lib/notifications";
import { addSupportMessage, getOrCreateSupportThread } from "@/lib/support";
import { buildUserAvatarSelect, getUserAvatarColumns } from "@/lib/user-avatar";

type JwtPayload = {
  id: number;
  roles?: string[];
};

type RouteContext = {
  params: Promise<{ id: string }>;
};

type ColumnRow = RowDataPacket & {
  Field: string;
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

type AdminRoleRow = RowDataPacket & {
  id: number;
};

function unauthorized(message = "Token inválido o faltante") {
  return NextResponse.json({ success: false, error: message }, { status: 401 });
}

function getAuthUser(req: NextRequest): JwtPayload | null {
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

function normalizeId(value: string) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

async function ensureOrdersColumns() {
  const [columns] = await pool.query<ColumnRow[]>("SHOW COLUMNS FROM orders");
  const columnNames = new Set(columns.map((column) => String(column.Field)));

  if (!columnNames.has("terminal_fee")) {
    await pool.query(
      `
        ALTER TABLE orders
        ADD COLUMN terminal_fee DECIMAL(10,2) NOT NULL DEFAULT 0.00
        AFTER subtotal
      `,
    );
  }

  if (!columnNames.has("payment_method")) {
    await pool.query(
      `
        ALTER TABLE orders
        ADD COLUMN payment_method VARCHAR(50) NULL
        AFTER payment_method_id
      `,
    );
  }

  if (!columnNames.has("comprobante_pago_url")) {
    await pool.query(
      `
        ALTER TABLE orders
        ADD COLUMN comprobante_pago_url MEDIUMTEXT NULL
        AFTER payment_method
      `,
    );
  }
}

async function ensureAdminMessagesTable() {
  await pool.query(
    `
      CREATE TABLE IF NOT EXISTS admin_messages (
        id INT AUTO_INCREMENT PRIMARY KEY,
        order_id INT NOT NULL,
        user_id INT NOT NULL,
        type VARCHAR(50) NOT NULL,
        message TEXT NOT NULL,
        file_url MEDIUMTEXT NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_admin_messages_order_id (order_id),
        INDEX idx_admin_messages_user_id (user_id)
      )
    `,
  );
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

async function getOrderById(orderId: number): Promise<any | null> {
  await ensureOrdersColumns();
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
        o.comprobante_pago_url,
        o.order_status_id,
        osc.name AS status_name,
        o.subtotal,
        o.terminal_fee,
        o.delivery_fee,
        o.service_fee,
        o.tip_amount,
        o.discount_amount,
        o.total_amount,
        o.customer_notes,
        o.placed_at,
        o.created_at,
        o.updated_at
        ,
        d.driver_user_id AS delivery_user_id,
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

async function isAdminGeneral(userId: number) {
  const [rows] = await pool.query<AdminRoleRow[]>(
    `
      SELECT ur.user_id AS id
      FROM user_roles ur
      INNER JOIN roles r ON r.id = ur.role_id
      WHERE ur.user_id = ? AND r.name = 'admin_general'
      LIMIT 1
    `,
    [userId],
  );

  return rows.length > 0;
}

export async function GET(req: NextRequest, context: RouteContext) {
  try {
    const authUser = getAuthUser(req);
    if (!authUser) return unauthorized();

    const { id: idParam } = await context.params;
    const orderId = normalizeId(idParam);

    if (!orderId) {
      return NextResponse.json(
        { success: false, error: "id inválido" },
        { status: 400 },
      );
    }

    const order = await getOrderById(orderId);

    if (!order) {
      return NextResponse.json(
        { success: false, error: "Pedido no encontrado" },
        { status: 404 },
      );
    }

    const canViewOrder =
      Number(order.user_id) === authUser.id ||
      (await isAdminGeneral(authUser.id));

    if (!canViewOrder) {
      return NextResponse.json(
        { success: false, error: "No autorizado para ver este pedido" },
        { status: 403 },
      );
    }

    return NextResponse.json({ message: "OK", order });
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
    const authUser = getAuthUser(req);
    if (!authUser) return unauthorized();

    const { id: idParam } = await context.params;
    const orderId = normalizeId(idParam);

    if (!orderId) {
      return NextResponse.json({ error: "id inválido" }, { status: 400 });
    }

    const existingOrder = await getOrderById(orderId);

    if (!existingOrder) {
      return NextResponse.json(
        { error: "Pedido no encontrado" },
        { status: 404 },
      );
    }

    if (Number(existingOrder.user_id) !== authUser.id) {
      return NextResponse.json(
        { error: "No autorizado para modificar este pedido" },
        { status: 403 },
      );
    }

    const body = await req.json();
    await ensureOrdersColumns();
    await ensureAdminMessagesTable();
    const fields: string[] = [];
    const values: Array<string | number | null> = [];

    if (body.status !== undefined) {
      const statusName = normalizeCatalogName(body.status, "pendiente");
      const statusId = await getOrCreateCatalogIdByName(
        "order_status_catalog",
        statusName,
      );

      fields.push("order_status_id = ?");
      values.push(statusId);
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

    if (body.comprobante_pago_url !== undefined) {
      fields.push("comprobante_pago_url = ?");
      values.push(String(body.comprobante_pago_url ?? "").trim() || null);
    }

    if (body.customer_notes !== undefined) {
      fields.push("customer_notes = ?");
      values.push(String(body.customer_notes ?? "").trim() || null);
    }

    if (
      !fields.length &&
      body.transfer_receipt_note === undefined &&
      body.comprobante_pago_url === undefined
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
          [orderId, authUser.id, noteText],
        );
      }
    }

    if (body.comprobante_pago_url !== undefined) {
      const proofUrl = String(body.comprobante_pago_url ?? "").trim();

      if (proofUrl) {
        await pool.query(
          `
            INSERT INTO admin_messages (order_id, user_id, type, message, file_url)
            VALUES (?, ?, 'payment_proof', ?, ?)
          `,
          [
            orderId,
            authUser.id,
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
