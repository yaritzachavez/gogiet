import crypto from "node:crypto";
import jwt from "jsonwebtoken";
import type {
  PoolConnection,
  ResultSetHeader,
  RowDataPacket,
} from "mysql2/promise";
import { type NextRequest, NextResponse } from "next/server";
import { isAuthUserActive } from "@/lib/auth-users";
import { getBusinessOpenStatus } from "@/lib/business-hours";
import { resolveBusinessAccess } from "@/lib/business-panel";
import pool, { logDbUsage } from "@/lib/db";
import { resolveDeliveryAccess } from "@/lib/delivery-access";
import { JWT_SECRET } from "@/lib/env";
import { getRequestLoggerContext, logger } from "@/lib/logger";
import {
  createNotificationForBusinessSafely,
  createNotificationsForAdminGeneralSafely,
} from "@/lib/notifications";
import {
  ensureOrderPaymentColumns,
  ensurePaymentsTable,
  upsertPaymentRecord,
} from "@/lib/order-payments";
import { calculateAuthoritativeOrderQuote } from "@/lib/order-quote";
import {
  ensureAdminMessagesRuntimeSchema,
  ensureOrderItemsRuntimeSchema,
  ensureOrdersRuntimeSchema,
} from "@/lib/order-schema";
import {
  getOrderStatusLabel,
  resolveCanonicalOrderStatus,
} from "@/lib/order-status";
import {
  ensureCanonicalOrderStatus,
  ensureCoreOrderStatuses,
} from "@/lib/order-status-server";
import { RuntimeSchemaError } from "@/lib/runtime-schema";
import { getActiveShippingZones } from "@/lib/shipping-zones";
import { addSupportMessage, getOrCreateSupportThread } from "@/lib/support";
import { isTransferPaymentEnabled } from "@/lib/transfer-config";
import { createOrdersGetHandler } from "./handler";

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
  business_id?: number | null;
};

type ProductRow = RowDataPacket & {
  id: number;
  name: string;
  price: string | number;
  discount_price: string | number | null;
  business_id: number;
  status_id: number | null;
  is_stock_available: number | boolean | null;
  stock_average: number | string | null;
  min_per_order: number | string | null;
  max_per_order: number | string | null;
};

type AddressRow = RowDataPacket & {
  id: number;
  user_id: number;
  reference_notes: string | null;
  neighborhood: string | null;
  latitude: string | number | null;
  longitude: string | number | null;
};

type BusinessRow = RowDataPacket & {
  id: number;
  status_id: number | null;
  is_open: number | boolean | null;
};

type ExistingOrderRow = RowDataPacket & {
  id: number;
  status: string | null;
  created_at: Date | string;
  payment_status: string | null;
  payment_provider: string | null;
  provider_payment_id: string | null;
  paid_at: Date | string | null;
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
  return NextResponse.json({ success: false, error: message }, { status: 401 });
}

function getAuthUser(req: NextRequest): JwtPayload | null {
  const auth = req.headers.get("authorization");
  const token = auth?.startsWith("Bearer ")
    ? auth.split(" ")[1]
    : req.cookies.get("authToken")?.value;
  if (!token) return null;

  try {
    return jwt.verify(token, JWT_SECRET) as JwtPayload;
  } catch {
    return null;
  }
}

function toPositiveNumber(value: unknown) {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) && numberValue > 0 ? numberValue : null;
}

function getOrderCreationErrorResponse(error: unknown) {
  if (error instanceof RuntimeSchemaError) {
    return {
      status: 503,
      message:
        "La base de pedidos no está actualizada todavía. Ejecuta las migraciones pendientes antes de recibir pedidos.",
    };
  }

  const code =
    typeof error === "object" && error !== null && "code" in error
      ? String((error as { code?: unknown }).code ?? "")
      : "";
  const sqlMessage =
    typeof error === "object" && error !== null && "sqlMessage" in error
      ? String((error as { sqlMessage?: unknown }).sqlMessage ?? "")
      : "";

  if (code === "ER_NO_REFERENCED_ROW_2" || code === "ER_ROW_IS_REFERENCED_2") {
    return {
      status: 400,
      message:
        "No pudimos relacionar el pedido con la dirección, negocio o método de pago seleccionados.",
    };
  }

  if (code === "ER_BAD_NULL_ERROR") {
    return {
      status: 400,
      message: "Faltan datos requeridos para crear el pedido.",
    };
  }

  if (
    code === "ER_TRUNCATED_WRONG_VALUE_FOR_FIELD" ||
    code === "ER_WARN_DATA_OUT_OF_RANGE"
  ) {
    return {
      status: 400,
      message: "Uno de los montos o valores del pedido no es válido.",
    };
  }

  if (code === "ER_DUP_ENTRY") {
    return {
      status: 409,
      message: "Ya existe un pedido similar en proceso para esta cuenta.",
    };
  }

  if (sqlMessage.toLowerCase().includes("stock")) {
    return {
      status: 400,
      message: "Uno o más productos ya no tienen stock suficiente.",
    };
  }

  return {
    status: 500,
    message: "Tu pedido no se pudo completar. Intenta nuevamente.",
  };
}

async function ensureOrdersColumns(conn: PoolConnection | typeof pool) {
  await ensureOrdersRuntimeSchema(conn);
  await ensureOrderPaymentColumns(conn);
}

function resolvePaymentProvider(paymentMethodName: string) {
  switch (paymentMethodName) {
    case "mercadopago":
      return "MERCADOPAGO";
    case "transferencia":
      return "TRANSFER";
    case "efectivo":
      return "CASH";
    case "terminal":
      return "TERMINAL";
    default:
      return "MANUAL";
  }
}

function getInitialPaymentRecord(input: {
  orderId: number;
  paymentMethodId: number;
  paymentMethodName: string;
  totalAmount: number;
  transferProofUrl?: string | null;
  transferReceiptNote?: string | null;
}) {
  switch (input.paymentMethodName) {
    case "efectivo":
      return {
        orderId: input.orderId,
        paymentMethodId: input.paymentMethodId,
        paymentStatus: "pending",
        transactionReference: `cash-order-${input.orderId}`,
        providerName: "Efectivo",
        provider: "CASH",
        status: "awaiting_collection",
        amount: input.totalAmount,
        currency: "MXN",
      };
    case "terminal":
      return {
        orderId: input.orderId,
        paymentMethodId: input.paymentMethodId,
        paymentStatus: "pending",
        transactionReference: `terminal-order-${input.orderId}`,
        providerName: "Terminal",
        provider: "TERMINAL",
        status: "awaiting_charge",
        amount: input.totalAmount,
        currency: "MXN",
      };
    case "transferencia":
      return {
        orderId: input.orderId,
        paymentMethodId: input.paymentMethodId,
        paymentStatus: "review",
        transactionReference: `transfer-order-${input.orderId}`,
        providerName: "Transferencia",
        provider: "TRANSFER",
        status: "awaiting_validation",
        amount: input.totalAmount,
        currency: "MXN",
        rawEvent: {
          transferProofUrl: input.transferProofUrl ?? null,
          transferReceiptNote: input.transferReceiptNote ?? null,
        },
      };
    default:
      return null;
  }
}

async function ensureOrderItemsTable(conn: PoolConnection | typeof pool) {
  await ensureOrderItemsRuntimeSchema(conn);
}

function buildOrderFingerprint(params: {
  userId: number;
  businessId: number;
  addressId: number;
  paymentMethod: string;
  total: number;
  items: Array<{ product_id: number; quantity: number }>;
}) {
  const base = JSON.stringify({
    userId: params.userId,
    businessId: params.businessId,
    addressId: params.addressId,
    paymentMethod: params.paymentMethod.trim().toLowerCase(),
    total: Number(params.total.toFixed(2)),
    items: params.items
      .map((item) => ({
        product_id: item.product_id,
        quantity: item.quantity,
      }))
      .sort((a, b) =>
        a.product_id === b.product_id
          ? a.quantity - b.quantity
          : a.product_id - b.product_id,
      ),
  });

  return crypto.createHash("sha256").update(base).digest("hex");
}

async function ensureAdminMessagesTable(conn: PoolConnection | typeof pool) {
  await ensureAdminMessagesRuntimeSchema(conn);
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
      mercadopago: "Pago con tarjeta vía Mercado Pago Checkout API",
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
      LEFT JOIN business b ON b.id = o.business_id
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

const getOrdersHandler = createOrdersGetHandler(NextResponse.json, {
  requireAuthenticatedUser: async (req) => {
    const authUser = getAuthUser(req as NextRequest);
    if (!authUser) {
      return {
        ok: false as const,
        response: unauthorized(),
      };
    }

    return {
      ok: true as const,
      access: {
        userId: authUser.id,
        email: null,
        roles: authUser.roles ?? [],
      },
    };
  },
  resolveBusinessAccess,
  resolveDeliveryAccess,
  ensureOrdersColumns: async () => ensureOrdersColumns(pool),
  ensureOrderItemsTable: async () => ensureOrderItemsTable(pool),
  ensureCoreOrderStatuses: async () => ensureCoreOrderStatuses(pool),
  ensureAdminMessagesTable: async () => ensureAdminMessagesTable(pool),
  logDbUsage,
  query: async (sql, params) => {
    const [rows] = await pool.query(sql, params);
    return [rows as RowDataPacket[]];
  },
  resolveCanonicalOrderStatus,
  getOrderStatusLabel,
});

export const GET = (req: NextRequest): Promise<Response> =>
  getOrdersHandler(req) as Promise<Response>;

export async function POST(req: NextRequest) {
  const requestContext = getRequestLoggerContext(req);
  const authUser = getAuthUser(req);
  if (!authUser) return unauthorized();

  const conn = await pool.getConnection();
  let stage = "parse_request";

  try {
    const body = await req.json();
    const isAdminGeneral = authUser.roles?.includes("admin_general") ?? false;
    const requestedUserId = toPositiveNumber(body.user_id);
    const userId =
      isAdminGeneral && requestedUserId ? requestedUserId : Number(authUser.id);
    const items = Array.isArray(body.items)
      ? (body.items as OrderItemInput[])
      : [];

    if (!userId) {
      return NextResponse.json(
        {
          success: false,
          error: "No pudimos identificar al usuario del pedido",
        },
        { status: 400 },
      );
    }

    const userIsActive = await isAuthUserActive(userId);
    if (!userIsActive) {
      return NextResponse.json(
        {
          success: false,
          error: "Tu cuenta está inactiva. Contacta a soporte.",
        },
        { status: 403 },
      );
    }

    if (!items.length) {
      return NextResponse.json(
        {
          success: false,
          error: "Agrega al menos un producto antes de continuar",
        },
        { status: 400 },
      );
    }

    const normalizedItems = items.map((item) => ({
      product_id: toPositiveNumber(item.product_id),
      quantity: toPositiveNumber(item.quantity),
      business_id: toPositiveNumber(item.business_id),
      notes: item.notes ?? null,
      customizations: item.customizations ?? null,
    }));

    if (normalizedItems.some((item) => !item.product_id || !item.quantity)) {
      return NextResponse.json(
        {
          success: false,
          error: "Hay productos con cantidad o precio inválido en el pedido",
        },
        { status: 400 },
      );
    }

    await conn.beginTransaction();
    stage = "ensure_runtime_schema";
    await ensureOrdersColumns(conn);
    await ensurePaymentsTable(conn);
    await ensureOrderItemsTable(conn);
    await ensureCoreOrderStatuses(conn);
    await ensureAdminMessagesTable(conn);

    stage = "resolve_address";
    const addressId =
      toPositiveNumber(body.delivery_address_id ?? body.address_id) ??
      (await getDefaultAddressId(conn, userId));
    const addressRow = addressId
      ? await (async () => {
          const [rows] = await conn.query<AddressRow[]>(
            `
              SELECT id, user_id, reference_notes, neighborhood, latitude, longitude
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
    if (paymentMethodName === "transferencia" && !isTransferPaymentEnabled()) {
      await conn.rollback();
      return NextResponse.json(
        {
          success: false,
          error:
            "La transferencia no está disponible en este momento. Elige otro método de pago.",
        },
        { status: 503 },
      );
    }
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
    const paymentProvider = resolvePaymentProvider(paymentMethodName);
    const normalizedPaymentStatus =
      paymentMethodName === "mercadopago"
        ? resolvedStatus.canonical === "paid"
          ? "approved"
          : resolvedStatus.canonical === "payment_failed"
            ? "failed"
            : "pending"
        : paymentMethodName === "transferencia"
          ? "review"
          : "pending";
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
    const productsQuery = `
      SELECT
        id,
        name,
        price,
        discount_price,
        business_id,
        status_id,
        is_stock_available,
        stock_average,
        min_per_order,
        max_per_order
      FROM products
      WHERE id IN (${placeholders})
    `;

    stage = "load_products";
    const [products] = await conn.query<ProductRow[]>(
      productsQuery,
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
    const frontendBusinessIds = new Set(
      normalizedItems
        .map((item) => item.business_id)
        .filter((value): value is number => Boolean(value)),
    );

    logger.info(
      "orders.business_validation",
      "Validación de negocio del pedido",
      {
        ...requestContext,
        businessIdsFromProducts: Array.from(businessIds),
        businessIdsFromFrontend: Array.from(frontendBusinessIds),
        businessIdReceived: body.business_id ?? null,
      },
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
          error:
            "No pudimos validar el negocio de este pedido. Revisa que todos los productos pertenezcan al mismo negocio y vuelvelos a agregar si es necesario.",
        },
        { status: 400 },
      );
    }

    const businessQuery = `
      SELECT id, status_id, is_open
      FROM business
      WHERE id = ?
      LIMIT 1
    `;

    logger.debug("orders.business_query", "Consulta del negocio del pedido", {
      ...requestContext,
      businessId,
    });

    const [businessRows] = await conn.query<BusinessRow[]>(businessQuery, [
      businessId,
    ]);

    const business = businessRows[0];

    logger.info("orders.business_found", "Negocio encontrado para el pedido", {
      ...requestContext,
      businessId,
      statusId: Number(business?.status_id ?? 0),
      isOpen: Boolean(business?.is_open),
    });

    const businessOpenNow = business
      ? await getBusinessOpenStatus(conn, businessId, {
          statusId: Number(business.status_id ?? 1),
          fallbackOpen: Boolean(business.is_open),
        })
      : false;

    if (
      !business ||
      Number(business.status_id ?? 0) !== 1 ||
      !businessOpenNow
    ) {
      await conn.rollback();
      return NextResponse.json(
        {
          success: false,
          error:
            "Este negocio está cerrado por el momento. Puedes volver dentro de su horario de atención.",
        },
        { status: 400 },
      );
    }

    const { zones } = await getActiveShippingZones();
    const quoteResult = calculateAuthoritativeOrderQuote({
      items: normalizedItems.map((item) => ({
        productId: item.product_id as number,
        quantity: item.quantity as number,
      })),
      products: products.map((product) => ({
        id: Number(product.id),
        name: String(product.name ?? "Producto"),
        businessId: Number(product.business_id),
        statusId: Number(product.status_id ?? 0),
        isStockAvailable: Boolean(product.is_stock_available),
        stockAverage: Number(product.stock_average ?? 0),
        price: Number(product.price ?? 0),
        discountPrice:
          product.discount_price == null
            ? null
            : Number(product.discount_price),
        minPerOrder:
          product.min_per_order == null ? null : Number(product.min_per_order),
        maxPerOrder:
          product.max_per_order == null ? null : Number(product.max_per_order),
      })),
      address: {
        neighborhood: addressRow?.neighborhood ?? null,
        latitude:
          addressRow?.latitude == null ? null : Number(addressRow.latitude),
        longitude:
          addressRow?.longitude == null ? null : Number(addressRow.longitude),
      },
      zones: zones.map((zone) => ({
        id: Number(zone.id),
        nombre: zone.nombre,
        distanciaKm: Number(zone.distanciaKm),
        activo: Boolean(zone.activo),
      })),
      clientQuote: {
        subtotal:
          body.subtotal == null || body.subtotal === ""
            ? null
            : Number(body.subtotal),
        shippingCost:
          body.shipping_cost == null || body.shipping_cost === ""
            ? null
            : Number(body.shipping_cost),
        deliveryFee:
          body.delivery_fee == null || body.delivery_fee === ""
            ? null
            : Number(body.delivery_fee),
        total:
          body.total == null || body.total === "" ? null : Number(body.total),
      },
    });

    if (!quoteResult.ok) {
      await conn.rollback();
      return NextResponse.json(
        {
          success: false,
          error: quoteResult.message,
          code: quoteResult.code,
          quote: quoteResult.quote ?? null,
        },
        {
          status:
            quoteResult.code === "PRICE_CHANGED" ||
            quoteResult.code === "DELIVERY_FEE_CHANGED" ||
            quoteResult.code === "QUOTE_CHANGED"
              ? 409
              : 400,
        },
      );
    }

    const commissionBreakdown = quoteResult.quote;
    const orderItems = normalizedItems.map((item) => {
      const product = productById.get(item.product_id as number);
      const quotedItem = commissionBreakdown.items.find(
        (candidate) => candidate.productId === item.product_id,
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
        product_snapshot_json: JSON.stringify({
          id: Number(product?.id ?? 0),
          name: String(product?.name ?? "Producto"),
          price: Number(product?.price ?? 0),
          discount_price:
            product?.discount_price == null
              ? null
              : Number(product.discount_price),
          business_id: Number(product?.business_id ?? 0),
          status_id: Number(product?.status_id ?? 0),
          is_stock_available: Boolean(product?.is_stock_available),
          stock_average: Number(product?.stock_average ?? 0),
        }),
        quantity: quotedItem?.quantity ?? (item.quantity as number),
        unit_price: quotedItem?.unitPrice ?? 0,
        subtotal: quotedItem?.subtotal ?? 0,
        notes: serializedItemNotes || null,
      };
    });

    const requestFingerprint = buildOrderFingerprint({
      userId,
      businessId,
      addressId,
      paymentMethod: paymentMethodName,
      total: commissionBreakdown.total,
      items: orderItems.map((item) => ({
        product_id: item.product_id,
        quantity: item.quantity,
      })),
    });

    const [existingOrders] = await conn.query<ExistingOrderRow[]>(
      `
        SELECT
          o.id,
          osc.name AS status,
          o.created_at,
          o.payment_status,
          o.payment_provider,
          o.provider_payment_id,
          o.paid_at
        FROM orders o
        LEFT JOIN order_status_catalog osc ON osc.id = o.order_status_id
        WHERE o.user_id = ?
          AND o.request_fingerprint = ?
          AND o.created_at >= (NOW() - INTERVAL 10 MINUTE)
        ORDER BY o.id DESC
        LIMIT 5
      `,
      [userId, requestFingerprint],
    );

    const existingOrder = existingOrders.find((order) => {
      const rawStatus = String(order.status ?? "").trim();

      if (!rawStatus) {
        return false;
      }

      const status = resolveCanonicalOrderStatus(rawStatus);
      const paymentStatus = String(order.payment_status ?? "")
        .trim()
        .toLowerCase();
      const createdAt = new Date(order.created_at);
      const ageMs = Number.isNaN(createdAt.getTime())
        ? Number.POSITIVE_INFINITY
        : Date.now() - createdAt.getTime();
      const isOlderThanFiveMinutes = ageMs > 5 * 60 * 1000;
      const hasConfirmedPayment =
        status === "paid" ||
        paymentStatus === "approved" ||
        paymentStatus === "paid" ||
        Boolean(order.paid_at);

      if (
        status === "cancelled" ||
        status === "delivered" ||
        status === "payment_failed" ||
        paymentStatus === "failed" ||
        paymentStatus === "rejected" ||
        paymentStatus === "cancelled" ||
        paymentStatus === "refunded" ||
        paymentStatus === "charged_back"
      ) {
        return false;
      }

      if (status === "pending_payment" && !hasConfirmedPayment) {
        return !isOlderThanFiveMinutes;
      }

      return [
        "pending",
        "paid",
        "payment_review",
        "accepted",
        "preparing",
        "ready_for_pickup",
        "delivery_requested",
        "driver_assigned",
        "on_the_way",
      ].includes(status);
    });

    console.log("duplicate-check", {
      userId,
      cartId: toPositiveNumber(body.cart_id) ?? null,
      existingOrder: existingOrder ? Number(existingOrder.id) : null,
      status: existingOrder?.status ?? null,
      createdAt: existingOrder?.created_at ?? null,
    });

    if (existingOrder) {
      await conn.rollback();
      return NextResponse.json(
        {
          success: false,
          error:
            "Ya estamos procesando un pedido similar. Revisa tus pedidos activos antes de intentar de nuevo.",
          orderId: Number(existingOrder.id),
        },
        { status: 409 },
      );
    }

    const orderSnapshot = {
      business_id: businessId,
      address_id: addressId,
      payment_method: paymentMethodName,
      items: orderItems.map((item) => ({
        product_id: item.product_id,
        product_name_snapshot: item.product_name_snapshot,
        quantity: item.quantity,
        unit_price: item.unit_price,
        subtotal: item.subtotal,
        notes: item.notes,
      })),
      totals: commissionBreakdown,
      created_from: "api/orders",
    };

    logger.info("orders.create_attempt", "Intento de creación de pedido", {
      ...requestContext,
      stage: "before_insert_order",
      userId,
      businessId,
      addressId,
      subtotal: commissionBreakdown.subtotal,
      shipping: commissionBreakdown.deliveryFee,
      serviceFee: commissionBreakdown.serviceFee,
      total: commissionBreakdown.total,
      paymentMethod: paymentMethodName,
      paymentMethodId,
      orderStatusId: resolvedStatus.statusId,
      itemsCount: orderItems.length,
    });

    stage = "insert_order";
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
          request_fingerprint,
          order_snapshot_json,
          payment_provider,
          payment_status,
          placed_at,
          created_at,
          updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW(), NOW())
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
        requestFingerprint,
        JSON.stringify(orderSnapshot),
        paymentProvider,
        normalizedPaymentStatus ?? "PENDING",
      ],
    );

    const orderId = orderResult.insertId;
    stage = "insert_order_items";
    await conn.query(
      `
        INSERT INTO order_items (
          order_id,
          product_id,
          product_name_snapshot,
          product_snapshot_json,
          unit_price,
          quantity,
          subtotal,
          notes
        )
        VALUES ?
      `,
      [
        orderItems.map((item) => [
          orderId,
          item.product_id,
          item.product_name_snapshot,
          item.product_snapshot_json,
          item.unit_price,
          item.quantity,
          item.subtotal,
          item.notes,
        ]),
      ],
    );

    if (body.delivery_instructions || body.client_note || body.customer_notes) {
      stage = "insert_order_note";
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
      stage = "insert_transfer_note";
      await conn.query(
        `
          INSERT INTO order_notes (order_id, user_id, note_type, note_text)
          VALUES (?, ?, 'payment_proof', ?)
        `,
        [orderId, userId, transferReceiptNote],
      );
    }

    const initialPaymentRecord = getInitialPaymentRecord({
      orderId,
      paymentMethodId,
      paymentMethodName,
      totalAmount: commissionBreakdown.total,
      transferProofUrl: transferProofUrl || null,
      transferReceiptNote: transferReceiptNote || null,
    });

    if (initialPaymentRecord) {
      stage = "insert_payment_record";
      await upsertPaymentRecord(conn, initialPaymentRecord);
    }

    if (paymentMethodName === "transferencia" && transferProofUrl) {
      stage = "insert_admin_message";
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

    await createNotificationsForAdminGeneralSafely(
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

    if (paymentMethodName !== "mercadopago") {
      await createNotificationForBusinessSafely(
        businessId,
        {
          type: "pedido",
          title: `Pedido nuevo #${orderId}`,
          message:
            paymentMethodName === "transferencia"
              ? "Se recibió un pedido con transferencia. Espera la validación del pago antes de prepararlo."
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
    }

    if (paymentMethodName === "transferencia") {
      stage = "notify_transfer_review";
      await createNotificationsForAdminGeneralSafely(
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
      stage = "notify_transfer_proof";
      await createNotificationsForAdminGeneralSafely(
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
      stage = "support_thread";
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
        stage = "support_payment_proof";
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

    if (activeCartId && paymentMethodName !== "mercadopago") {
      stage = "clear_cart";
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

    stage = "load_created_order";
    const order = await getOrderById(orderId, conn);
    stage = "commit";
    await conn.commit();

    return NextResponse.json(
      { success: true, message: "Pedido creado correctamente", order },
      { status: 201 },
    );
  } catch (error) {
    await conn.rollback();
    const response = getOrderCreationErrorResponse(error);
    logger.error("orders.create_error", "Error creando pedido", {
      ...requestContext,
      stage,
      errorCode:
        typeof error === "object" && error !== null && "code" in error
          ? String((error as { code?: unknown }).code ?? "")
          : null,
      errorMessage:
        typeof error === "object" && error !== null && "message" in error
          ? String((error as { message?: unknown }).message ?? "")
          : String(error),
      sqlMessage:
        typeof error === "object" && error !== null && "sqlMessage" in error
          ? String((error as { sqlMessage?: unknown }).sqlMessage ?? "")
          : null,
      error,
    });
    return NextResponse.json(
      {
        success: false,
        error: response.message,
      },
      { status: response.status },
    );
  } finally {
    conn.release();
  }
}
