import jwt from "jsonwebtoken";
import type {
  PoolConnection,
  ResultSetHeader,
  RowDataPacket,
} from "mysql2/promise";
import { type NextRequest, NextResponse } from "next/server";
import pool, { logDbUsage } from "@/lib/db";
import {
  ensureOrderPaymentColumns,
  ensurePaymentsTable,
} from "@/lib/order-payments";
import {
  createNotificationForBusiness,
  createNotificationsForAdminGeneral,
} from "@/lib/notifications";
import { calculateOrderCommissionBreakdown } from "@/lib/order-commissions";
import {
  getOrderStatusLabel,
  resolveCanonicalOrderStatus,
} from "@/lib/order-status";
import {
  ensureCanonicalOrderStatus,
  ensureCoreOrderStatuses,
} from "@/lib/order-status-server";
import { addSupportMessage, getOrCreateSupportThread } from "@/lib/support";

type JwtPayload = {
  id: number;
  roles?: string[];
};

type OrderItemInput = {
  product_id: number;
  quantity: number;
  notes?: string | null;
  unit_price?: number | null;
  customizations?: string | null;
  total_price?: number | null;
};

type ProductRow = RowDataPacket & {
  id: number;
  name: string;
  price: string | number;
  discount_price: string | number | null;
  business_id: number;
};

type AddressRow = RowDataPacket & {
  id: number;
  user_id: number;
  reference_notes: string | null;
  neighborhood: string | null;
};

type BusinessRow = RowDataPacket & {
  id: number;
  status_id: number | null;
  is_open: number | boolean | null;
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

function unauthorized(message = "Necesitas iniciar sesión para continuar.") {
  return NextResponse.json(
    { success: false, error: message },
    { status: 401 },
  );
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

function toPositiveNumber(value: unknown) {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) && numberValue > 0 ? numberValue : null;
}

async function ensureOrdersColumns(conn: PoolConnection | typeof pool) {
  await conn.query(
    `
      CREATE TABLE IF NOT EXISTS orders (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        cart_id INT NULL,
        business_id INT NOT NULL,
        driver_id INT NULL,
        address_id INT NOT NULL,
        payment_method_id INT NOT NULL,
        payment_method VARCHAR(50) NULL,
        payment_receipt_url MEDIUMTEXT NULL,
        comprobante_pago_url MEDIUMTEXT NULL,
        order_status_id INT NOT NULL,
        subtotal DECIMAL(10,2) NOT NULL,
        terminal_fee DECIMAL(10,2) NOT NULL DEFAULT 0.00,
        delivery_fee DECIMAL(10,2) NOT NULL DEFAULT 0.00,
        service_fee DECIMAL(10,2) NOT NULL DEFAULT 0.00,
        platform_fee DECIMAL(10,2) NOT NULL DEFAULT 0.00,
        driver_fee DECIMAL(10,2) NOT NULL DEFAULT 0.00,
        tip_amount DECIMAL(10,2) NOT NULL DEFAULT 0.00,
        discount_amount DECIMAL(10,2) NOT NULL DEFAULT 0.00,
        total_amount DECIMAL(10,2) NOT NULL,
        customer_notes VARCHAR(255) NULL,
        placed_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        confirmed_at DATETIME NULL,
        delivered_at DATETIME NULL,
        cancelled_at DATETIME NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        INDEX fk_orders_user (user_id),
        INDEX fk_orders_cart (cart_id),
        INDEX fk_orders_business (business_id),
        INDEX fk_orders_address (address_id),
        INDEX fk_orders_payment_method (payment_method_id),
        INDEX fk_orders_order_status (order_status_id)
      )
    `,
  );

  const [columns] = await conn.query<ColumnRow[]>("SHOW COLUMNS FROM orders");
  const columnNames = new Set(columns.map((column) => String(column.Field)));

  if (!columnNames.has("terminal_fee")) {
    await conn.query(
      `
        ALTER TABLE orders
        ADD COLUMN terminal_fee DECIMAL(10,2) NOT NULL DEFAULT 0.00
        AFTER subtotal
      `,
    );
  }

  if (!columnNames.has("payment_method")) {
    await conn.query(
      `
        ALTER TABLE orders
        ADD COLUMN payment_method VARCHAR(50) NULL
        AFTER payment_method_id
      `,
    );
  }

  if (!columnNames.has("comprobante_pago_url")) {
    await conn.query(
      `
        ALTER TABLE orders
        ADD COLUMN comprobante_pago_url MEDIUMTEXT NULL
        AFTER payment_method
      `,
    );
  }

  if (!columnNames.has("payment_receipt_url")) {
    await conn.query(
      `
        ALTER TABLE orders
        ADD COLUMN payment_receipt_url MEDIUMTEXT NULL
        AFTER payment_method
      `,
    );
  }

  if (!columnNames.has("driver_id")) {
    await conn.query(
      `
        ALTER TABLE orders
        ADD COLUMN driver_id INT NULL
        AFTER business_id
      `,
    );
  }

  if (!columnNames.has("platform_fee")) {
    await conn.query(
      `
        ALTER TABLE orders
        ADD COLUMN platform_fee DECIMAL(10,2) NOT NULL DEFAULT 0.00
        AFTER service_fee
      `,
    );
  }

  if (!columnNames.has("driver_fee")) {
    await conn.query(
      `
        ALTER TABLE orders
        ADD COLUMN driver_fee DECIMAL(10,2) NOT NULL DEFAULT 0.00
        AFTER platform_fee
      `,
    );
  }

  await ensureOrderPaymentColumns(conn);
}

function parseAddressMeta(referenceNotes?: string | null) {
  if (!referenceNotes) return {};

  try {
    return JSON.parse(referenceNotes) as {
      estimatedDistanceKm?: number | null;
      zone?: string;
    };
  } catch {
    return {};
  }
}

async function ensureOrderItemsTable(conn: PoolConnection | typeof pool) {
  await conn.query(
    `
      CREATE TABLE IF NOT EXISTS order_items (
        id INT AUTO_INCREMENT PRIMARY KEY,
        order_id INT NOT NULL,
        product_id INT NOT NULL,
        product_name_snapshot VARCHAR(120) NOT NULL,
        unit_price DECIMAL(10,2) NOT NULL,
        quantity INT NOT NULL DEFAULT 1,
        subtotal DECIMAL(10,2) NOT NULL,
        notes VARCHAR(255) NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        INDEX fk_order_items_order (order_id),
        INDEX fk_order_items_product (product_id)
      )
    `,
  );
}

async function ensureAdminMessagesTable(conn: PoolConnection | typeof pool) {
  await conn.query(
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

async function getOrCreateCatalogId(
  conn: PoolConnection,
  table: "order_status_catalog" | "payment_methods",
  name: string,
) {
  const normalizedName = normalizeCatalogName(
    name,
    table === "payment_methods" ? "efectivo" : "pendiente",
  );
  const [rows] = await conn.query<RowDataPacket[]>(
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
      mercadopago: "Pago con tarjeta vía Mercado Pago Checkout Pro",
    };

    const [result] = await conn.query<ResultSetHeader>(
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
    pendiente_de_pago: "Pedido pendiente de pago en línea",
    pendiente: "Pedido pendiente de preparacion",
    pagado: "Pedido pagado pendiente de atención",
    por_validar_pago: "Transferencia recibida pendiente de validacion",
    pago_fallido: "El pago del pedido no se completó",
  };

  const [result] = await conn.query<ResultSetHeader>(
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
      normalizedName === "pendiente_de_pago"
        ? 1
        : normalizedName === "por_validar_pago"
          ? 3
          : normalizedName === "pagado"
            ? 2
            : normalizedName === "pago_fallido"
              ? 99
              : 1,
    ],
  );

  return result.insertId;
}

async function getDefaultAddressId(conn: PoolConnection, userId: number) {
  const [rows] = await conn.query<RowDataPacket[]>(
    `
      SELECT id
      FROM addresses
      WHERE user_id = ? AND status_id = 1
      ORDER BY is_default DESC, id ASC
      LIMIT 1
    `,
    [userId],
  );

  return rows[0]?.id as number | undefined;
}

async function getOrderById(
  orderId: number,
  conn: PoolConnection | typeof pool = pool,
) {
  await ensureOrdersColumns(conn);

  const [orderRows] = await conn.query<RowDataPacket[]>(
    `
      SELECT
        o.id,
        o.user_id,
        CONCAT(u.first_name, ' ', COALESCE(u.last_name, '')) AS customer_name,
        u.phone AS customer_phone,
        o.cart_id,
        o.business_id,
        b.name AS business_name,
        b.address AS pickup_address,
        b.district AS pickup_district,
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
        o.confirmed_at,
        o.delivered_at,
        o.cancelled_at,
        o.created_at,
        o.updated_at,
        d.id AS delivery_id,
        COALESCE(o.driver_id, d.driver_user_id) AS driver_user_id
      FROM orders o
      LEFT JOIN users u ON u.id = o.user_id
      LEFT JOIN businesses b ON b.id = o.business_id
      LEFT JOIN addresses a ON a.id = o.address_id
      LEFT JOIN payment_methods pm ON pm.id = o.payment_method_id
      LEFT JOIN order_status_catalog osc ON osc.id = o.order_status_id
      LEFT JOIN delivery d ON d.order_id = o.id
      WHERE o.id = ?
      LIMIT 1
    `,
    [orderId],
  );

  if (!orderRows.length) return null;

  const [items] = await conn.query<RowDataPacket[]>(
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

  const [notes] = await conn.query<RowDataPacket[]>(
    `
      SELECT id, user_id, note_type, note_text, created_at
      FROM order_notes
      WHERE order_id = ?
      ORDER BY created_at ASC
    `,
    [orderId],
  );

  await ensureAdminMessagesTable(conn);
  const [adminMessages] = await conn.query<AdminMessageRow[]>(
    `
      SELECT id, order_id, user_id, type, message, file_url, created_at
      FROM admin_messages
      WHERE order_id = ?
      ORDER BY created_at ASC
    `,
    [orderId],
  );

  return { ...orderRows[0], items, notes, admin_messages: adminMessages };
}

export async function GET(req: NextRequest) {
  try {
    const authUser = getAuthUser(req);
    if (!authUser) return unauthorized();
    logDbUsage("/api/orders", {
      userId: authUser.id,
      role: authUser.roles ?? [],
    });
    await ensureOrdersColumns(pool);
    await ensureOrderItemsTable(pool);
    await ensureCoreOrderStatuses(pool);
    await ensureAdminMessagesTable(pool);
    await ensurePaymentsTable(pool);

    const { searchParams } = new URL(req.url);
    const requestedUserId = searchParams.get("user_id");
    const businessId = searchParams.get("business_id");
    const deliveryId = searchParams.get("delivery_id");
    const statusId = searchParams.get("status_id");
    const limitParam = Number(searchParams.get("limit") ?? 50);
    const limit = Number.isFinite(limitParam)
      ? Math.min(Math.max(limitParam, 1), 100)
      : 50;

    const filters: string[] = [];
    const values: Array<string | number> = [];

    const isAdminGeneral = authUser.roles?.includes("admin_general") ?? false;
    const userId = toPositiveNumber(requestedUserId);

    if (userId) {
      filters.push("o.user_id = ?");
      values.push(userId);
    } else if (!isAdminGeneral) {
      filters.push("o.user_id = ?");
      values.push(authUser.id);
    }

    if (businessId) {
      filters.push("o.business_id = ?");
      values.push(businessId);
    }

    if (deliveryId) {
      filters.push("COALESCE(o.driver_id, d.driver_user_id) = ?");
      values.push(deliveryId);
    }

    if (statusId) {
      filters.push("o.order_status_id = ?");
      values.push(statusId);
    }

    values.push(limit);

    const [orders] = await pool.query<RowDataPacket[]>(
      `
        SELECT
          o.id,
          o.user_id,
          CONCAT(u.first_name, ' ', COALESCE(u.last_name, '')) AS customer_name,
          u.phone AS customer_phone,
          o.business_id,
          b.name AS business_name,
          b.address AS pickup_address,
          b.district AS pickup_district,
          d.id AS delivery_id,
          COALESCE(o.driver_id, d.driver_user_id) AS driver_user_id,
          o.order_status_id AS status_id,
          osc.name AS status_name,
          o.address_id,
          a.street,
          a.external_number,
          a.internal_number,
          a.neighborhood,
          a.city,
          a.state,
          o.total_amount,
          o.subtotal,
          o.terminal_fee,
          o.delivery_fee,
          o.service_fee,
          o.platform_fee,
          o.driver_fee,
          COALESCE(o.payment_method, pm.name) AS payment_method,
          o.comprobante_pago_url,
          o.created_at,
          o.updated_at,
          COUNT(oi.id) AS items_count
        FROM orders o
        LEFT JOIN users u ON u.id = o.user_id
        LEFT JOIN businesses b ON b.id = o.business_id
        LEFT JOIN addresses a ON a.id = o.address_id
        LEFT JOIN payment_methods pm ON pm.id = o.payment_method_id
        LEFT JOIN order_status_catalog osc ON osc.id = o.order_status_id
        LEFT JOIN delivery d ON d.order_id = o.id
        LEFT JOIN order_items oi ON oi.order_id = o.id
        ${filters.length ? `WHERE ${filters.join(" AND ")}` : ""}
        GROUP BY o.id
        ORDER BY o.created_at DESC
        LIMIT ?
      `,
      values,
    );

    const normalizedOrders = await Promise.all(
      orders.map(async (order) => {
        const [items] = await pool.query<RowDataPacket[]>(
          `
            SELECT
              oi.id,
              oi.product_id,
              oi.product_name_snapshot AS product_name,
              oi.quantity,
              oi.unit_price,
              oi.subtotal,
              oi.notes
            FROM order_items oi
            WHERE oi.order_id = ?
            ORDER BY oi.id ASC
          `,
          [order.id],
        );

        const [adminMessages] = await pool.query<AdminMessageRow[]>(
          `
            SELECT id, order_id, user_id, type, message, file_url, created_at
            FROM admin_messages
            WHERE order_id = ?
            ORDER BY created_at ASC
          `,
          [order.id],
        );

        const addressParts = [
          order.street,
          [
            order.external_number,
            order.internal_number ? `Int. ${order.internal_number}` : "",
          ]
            .filter(Boolean)
            .join(" "),
          order.neighborhood,
          order.city,
          order.state,
        ].filter(Boolean);

        return {
          id: Number(order.id),
          status: resolveCanonicalOrderStatus(order.status_name),
          statusLabel: getOrderStatusLabel(order.status_name),
          customerName: String(order.customer_name ?? ""),
          customerPhone: String(order.customer_phone ?? ""),
          businessName: String(order.business_name ?? ""),
          total: Number(order.total_amount ?? 0),
          subtotal: Number(order.subtotal ?? 0),
          terminalFee: Number(order.terminal_fee ?? 0),
          shippingCost: Number(order.delivery_fee ?? 0),
          serviceFee: Number(order.service_fee ?? 0),
          platformFee: Number(order.platform_fee ?? 0),
          driverFee: Number(order.driver_fee ?? 0),
          paymentMethod: String(order.payment_method ?? ""),
          paymentReceiptUrl: order.payment_receipt_url
            ? String(order.payment_receipt_url)
            : "",
          transferProofUrl: order.payment_receipt_url
            ? String(order.payment_receipt_url)
            : "",
          createdAt: order.created_at,
          address: {
            id: Number(order.address_id),
            fullAddress: addressParts.join(", "),
          },
          products: items.map((item) => ({
            id: Number(item.id),
            productId: Number(item.product_id),
            name: String(item.product_name ?? ""),
            quantity: Number(item.quantity ?? 0),
            unitPrice: Number(item.unit_price ?? 0),
            totalPrice: Number(item.subtotal ?? 0),
            notes: item.notes ? String(item.notes) : "",
          })),
          adminMessages: adminMessages.map((message) => ({
            id: Number(message.id),
            type: String(message.type),
            message: String(message.message),
            fileUrl: message.file_url ? String(message.file_url) : "",
            createdAt: message.created_at,
          })),
        };
      }),
    );

    return NextResponse.json({ success: true, orders: normalizedOrders });
  } catch (error) {
    console.error("Error GET /api/orders:", error);
    return NextResponse.json(
      {
        success: false,
        error: "No pudimos cargar tus pedidos. Intenta nuevamente.",
      },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest) {
  const authUser = getAuthUser(req);
  if (!authUser) return unauthorized();

  const conn = await pool.getConnection();

  try {
    const body = await req.json();
    const userId = toPositiveNumber(body.user_id ?? authUser.id);
    const items = Array.isArray(body.items)
      ? (body.items as OrderItemInput[])
      : [];

    if (!userId) {
      return NextResponse.json(
        { success: false, error: "No pudimos identificar al usuario del pedido" },
        { status: 400 },
      );
    }

    if (!items.length) {
      return NextResponse.json(
        { success: false, error: "Agrega al menos un producto antes de continuar" },
        { status: 400 },
      );
    }

    const normalizedItems = items.map((item) => ({
      product_id: toPositiveNumber(item.product_id),
      quantity: toPositiveNumber(item.quantity),
      notes: item.notes ?? null,
      unit_price: item.unit_price != null ? Number(item.unit_price) : null,
      customizations: item.customizations ?? null,
      total_price: item.total_price != null ? Number(item.total_price) : null,
    }));

    if (
      normalizedItems.some(
        (item) =>
          !item.product_id ||
          !item.quantity ||
          (item.unit_price != null && !Number.isFinite(item.unit_price)) ||
          (item.total_price != null && !Number.isFinite(item.total_price)),
      )
    ) {
      return NextResponse.json(
        {
          success: false,
          error: "Hay productos con cantidad o precio inválido en el pedido",
        },
        { status: 400 },
      );
    }

    await conn.beginTransaction();
    await ensureOrdersColumns(conn);
    await ensureOrderItemsTable(conn);
    await ensureCoreOrderStatuses(conn);
    await ensureAdminMessagesTable(conn);
    await ensurePaymentsTable(conn);

    const addressId =
      toPositiveNumber(body.delivery_address_id ?? body.address_id) ??
      (await getDefaultAddressId(conn, userId));
    const addressRow = addressId
      ? await (async () => {
          const [rows] = await conn.query<AddressRow[]>(
            `
              SELECT id, user_id, reference_notes, neighborhood
              FROM addresses
              WHERE id = ? AND user_id = ?
              LIMIT 1
            `,
            [addressId, userId],
          );

          return rows[0] ?? null;
        })()
      : null;
    const addressIsValid = Boolean(addressRow);
    const paymentMethodName = normalizeCatalogName(
      body.payment_method,
      "efectivo",
    );
    const requestedStatus = resolveCanonicalOrderStatus(body.status);
    const paymentMethodId =
      toPositiveNumber(body.payment_method_id) ??
      (await getOrCreateCatalogId(conn, "payment_methods", paymentMethodName));
    const orderStatusId = toPositiveNumber(
      body.order_status_id ?? body.status_id,
    );
    const resolvedStatus =
      orderStatusId != null
        ? { statusId: orderStatusId, canonical: requestedStatus }
        : await ensureCanonicalOrderStatus(
            paymentMethodName === "transferencia"
              ? "payment_review"
              : paymentMethodName === "mercadopago" &&
                  requestedStatus === "pending"
                ? "pending_payment"
              : requestedStatus,
            conn,
          );
    const paymentProvider =
      paymentMethodName === "mercadopago" ? "MERCADOPAGO" : null;
    const normalizedPaymentStatus =
      paymentMethodName === "mercadopago"
        ? resolvedStatus.canonical === "paid"
          ? "approved"
          : resolvedStatus.canonical === "payment_failed"
            ? "failed"
            : "pending"
        : paymentMethodName === "transferencia"
          ? "review"
          : null;
    const transferProofUrl =
      typeof (body.payment_receipt_url ?? body.comprobante_pago_url) ===
      "string"
        ? String(body.payment_receipt_url ?? body.comprobante_pago_url).trim()
        : "";
    const transferReceiptNote =
      typeof body.transfer_receipt_note === "string"
        ? body.transfer_receipt_note.trim()
        : "";

    if (!addressId || !addressIsValid) {
      await conn.rollback();
      return NextResponse.json(
        {
          success: false,
          error: "La dirección de entrega no es válida para este usuario",
        },
        { status: 400 },
      );
    }

    const productIds = normalizedItems.map((item) => item.product_id as number);
    const placeholders = productIds.map(() => "?").join(",");
    const [products] = await conn.query<ProductRow[]>(
      `
        SELECT id, name, price, discount_price, business_id
        FROM products
        WHERE id IN (${placeholders})
          AND status_id = 1
      `,
      productIds,
    );

    if (products.length !== new Set(productIds).size) {
      await conn.rollback();
      return NextResponse.json(
        {
          success: false,
          error: "Uno o más productos ya no están disponibles para este pedido",
        },
        { status: 400 },
      );
    }

    const productById = new Map(
      products.map((product) => [Number(product.id), product]),
    );
    const businessIds = new Set(
      products.map((product) => Number(product.business_id)),
    );

    if (businessIds.size !== 1) {
      await conn.rollback();
      return NextResponse.json(
        {
          success: false,
          error:
            "Todos los productos del pedido deben pertenecer al mismo negocio",
        },
        { status: 400 },
      );
    }

    const businessId =
      toPositiveNumber(body.business_id) ?? Array.from(businessIds)[0] ?? null;

    if (!businessId || !businessIds.has(businessId)) {
      await conn.rollback();
      return NextResponse.json(
        {
          success: false,
          error: "No pudimos validar el negocio de este pedido.",
        },
        { status: 400 },
      );
    }

    const [businessRows] = await conn.query<BusinessRow[]>(
      `
        SELECT id, status_id, is_open
        FROM businesses
        WHERE id = ?
        LIMIT 1
      `,
      [businessId],
    );

    const business = businessRows[0];

    if (
      !business ||
      Number(business.status_id ?? 0) !== 1 ||
      !business.is_open
    ) {
      await conn.rollback();
      return NextResponse.json(
        {
          success: false,
          error: "Este negocio no está disponible para recibir pedidos",
        },
        { status: 400 },
      );
    }

    const orderItems = normalizedItems.map((item) => {
      const product = productById.get(item.product_id as number);
      const quantity = item.quantity as number;
      const unitPrice = Number(
        item.unit_price ?? product?.discount_price ?? product?.price ?? 0,
      );
      const subtotal = Number(
        (item.total_price ?? Number((unitPrice * quantity).toFixed(2))).toFixed(
          2,
        ),
      );
      const serializedItemNotes = [
        item.notes?.trim(),
        item.customizations?.trim(),
      ]
        .filter(Boolean)
        .join(" | ")
        .slice(0, 255);

      return {
        product_id: item.product_id as number,
        product_name_snapshot: product?.name ?? "Producto",
        quantity,
        unit_price: unitPrice,
        subtotal,
        notes: serializedItemNotes || null,
      };
    });

    const subtotal = Number(
      orderItems.reduce((sum, item) => sum + item.subtotal, 0).toFixed(2),
    );
    const terminalFee =
      paymentMethodName === "terminal" ? Number(body.terminal_fee ?? 0) : 0;
    const tipAmount = Number(body.tip_amount ?? 0);
    const discountAmount = Number(body.discount_amount ?? 0);
    const addressMeta = parseAddressMeta(addressRow?.reference_notes);
    const estimatedDistanceKm =
      typeof addressMeta.estimatedDistanceKm === "number"
        ? Number(addressMeta.estimatedDistanceKm)
        : null;
    const commissionBreakdown = calculateOrderCommissionBreakdown({
      subtotal,
      distanceKm: estimatedDistanceKm,
      deliveryFeeOverride:
        addressMeta.estimatedDistanceKm == null
          ? Number(body.shipping_cost ?? body.delivery_fee ?? 0)
          : null,
      terminalFee,
      tipAmount,
      discountAmount,
    });

    if (
      commissionBreakdown.subtotal <= 0 ||
      commissionBreakdown.terminalFee < 0 ||
      commissionBreakdown.serviceFee < 0 ||
      commissionBreakdown.total <= 0 ||
      commissionBreakdown.deliveryFee < 0
    ) {
      await conn.rollback();
      return NextResponse.json(
        { success: false, error: "Los montos del pedido no son válidos" },
        { status: 400 },
      );
    }

    const [orderResult] = await conn.query<ResultSetHeader>(
      `
        INSERT INTO orders (
          user_id,
          cart_id,
          business_id,
          address_id,
          payment_method_id,
          payment_method,
          payment_receipt_url,
          comprobante_pago_url,
          order_status_id,
          subtotal,
          terminal_fee,
          delivery_fee,
          service_fee,
          platform_fee,
          driver_fee,
          tip_amount,
          discount_amount,
          total_amount,
          customer_notes,
          payment_provider,
          payment_status,
          placed_at,
          created_at,
          updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW(), NOW())
      `,
      [
        userId,
        body.cart_id ?? null,
        businessId,
        addressId,
        paymentMethodId,
        paymentMethodName,
        transferProofUrl || null,
        transferProofUrl || null,
        resolvedStatus.statusId,
        commissionBreakdown.subtotal,
        commissionBreakdown.terminalFee,
        commissionBreakdown.deliveryFee,
        commissionBreakdown.serviceFee,
        commissionBreakdown.platformFee,
        commissionBreakdown.driverFee,
        commissionBreakdown.tipAmount,
        commissionBreakdown.discountAmount,
        commissionBreakdown.total,
        body.delivery_instructions ??
          body.customer_notes ??
          body.client_note ??
          null,
        paymentProvider,
        normalizedPaymentStatus,
      ],
    );

    const orderId = orderResult.insertId;
    const itemValues = orderItems.map((item) => [
      orderId,
      item.product_id,
      item.product_name_snapshot,
      item.unit_price,
      item.quantity,
      item.subtotal,
      item.notes,
    ]);

    await conn.query(
      `
        INSERT INTO order_items (
          order_id,
          product_id,
          product_name_snapshot,
          unit_price,
          quantity,
          subtotal,
          notes
        )
        VALUES ?
      `,
      [itemValues],
    );

    if (body.delivery_instructions || body.client_note || body.customer_notes) {
      await conn.query(
        `
          INSERT INTO order_notes (order_id, user_id, note_type, note_text)
          VALUES (?, ?, 'cliente', ?)
        `,
        [
          orderId,
          userId,
          body.delivery_instructions ?? body.client_note ?? body.customer_notes,
        ],
      );
    }

    if (transferReceiptNote) {
      await conn.query(
        `
          INSERT INTO order_notes (order_id, user_id, note_type, note_text)
          VALUES (?, ?, 'payment_proof', ?)
        `,
        [orderId, userId, transferReceiptNote],
      );
    }

    if (paymentMethodName === "transferencia" && transferProofUrl) {
      await conn.query(
        `
          INSERT INTO admin_messages (
            order_id,
            user_id,
            type,
            message,
            file_url
          )
          VALUES (?, ?, 'payment_proof', ?, ?)
        `,
        [
          orderId,
          userId,
          "El cliente subió comprobante de transferencia para validar el pago.",
          transferProofUrl,
        ],
      );
    }

    await createNotificationsForAdminGeneral(
      {
        type: "pedido",
        title: `Pedido nuevo #${orderId}`,
        message:
          paymentMethodName === "transferencia"
            ? "Se creó un pedido nuevo con transferencia por validar y aún no tiene repartidor asignado."
            : paymentMethodName === "mercadopago"
              ? "Se creó un pedido nuevo con pago en línea pendiente de confirmación."
              : "Se creó un pedido nuevo y aún no tiene repartidor asignado.",
        relatedId: orderId,
      },
      conn,
    );

    await createNotificationForBusiness(
      businessId,
      {
        type: "pedido",
        title: `Pedido nuevo #${orderId}`,
        message:
          paymentMethodName === "transferencia"
            ? "Se recibió un pedido con transferencia. Espera la validación del pago antes de prepararlo."
            : paymentMethodName === "mercadopago"
              ? "Se recibió un pedido con pago en línea pendiente. Prepáralo cuando Mercado Pago confirme el cobro."
              : "Tienes un pedido nuevo pendiente de preparación en tu negocio.",
        relatedId: orderId,
        dataJson: {
          order_id: orderId,
          business_id: businessId,
          payment_method: paymentMethodName,
        },
      },
      conn,
    );

    if (paymentMethodName === "transferencia") {
      await createNotificationsForAdminGeneral(
        {
          type: "pago",
          title: `Pago por validar #${orderId}`,
          message: transferProofUrl
            ? "Se recibió un pedido con transferencia y comprobante cargado."
            : "Se recibió un pedido con transferencia pendiente de validación.",
          relatedId: orderId,
        },
        conn,
      );
    }

    if (transferProofUrl) {
      await createNotificationsForAdminGeneral(
        {
          type: "pago",
          title: `Comprobante subido #${orderId}`,
          message:
            "El cliente subió un comprobante de transferencia para validar el pago.",
          relatedId: orderId,
        },
        conn,
      );
    }

    if (paymentMethodName === "transferencia") {
      const supportThreadId = await getOrCreateSupportThread(
        { userId, orderId },
        conn,
      );

      await addSupportMessage(
        {
          threadId: supportThreadId,
          senderId: null,
          senderType: "system",
          message:
            "Pedido con pago por transferencia creado y pendiente de validación.",
          messageType: "text",
        },
        conn,
      );

      if (transferProofUrl) {
        await addSupportMessage(
          {
            threadId: supportThreadId,
            senderId: null,
            senderType: "system",
            message: "Comprobante de transferencia recibido para validar pago.",
            fileUrl: transferProofUrl,
            messageType: "payment_proof",
          },
          conn,
        );
      }
    }

    const activeCartId =
      toPositiveNumber(body.cart_id) ??
      (
        await conn.query<RowDataPacket[]>(
          `
            SELECT id
            FROM cart
            WHERE user_id = ? AND status = 'activo'
            ORDER BY updated_at DESC
            LIMIT 1
          `,
          [userId],
        )
      )[0][0]?.id;

    if (activeCartId) {
      await conn.query(`DELETE FROM products_cart WHERE cart_id = ?`, [
        activeCartId,
      ]);
      await conn.query(
        `
          UPDATE cart
          SET status = 'procesado', updated_at = NOW()
          WHERE id = ?
        `,
        [activeCartId],
      );
    }

    const order = await getOrderById(orderId, conn);
    await conn.commit();

    return NextResponse.json(
      { success: true, message: "Pedido creado correctamente", order },
      { status: 201 },
    );
  } catch (error) {
    await conn.rollback();
    console.error("Error POST /api/orders:", {
      error,
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : null,
    });
    return NextResponse.json(
      {
        success: false,
        error: "Tu pedido no se pudo completar. Intenta nuevamente.",
      },
      { status: 500 },
    );
  } finally {
    conn.release();
  }
}
