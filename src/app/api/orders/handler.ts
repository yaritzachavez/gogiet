import type { RowDataPacket } from "mysql2/promise";

type JsonResponse = {
  status: number;
  json: () => Promise<unknown>;
};

type JsonResponseFactory = (
  body: unknown,
  init: { status: number },
) => JsonResponse;

type OrdersRouteRequest = {
  url: string;
};

type PermissionAccess = {
  userId: number;
  email: string | null;
  roles: string[];
};

type BusinessAccess = {
  userId: number;
  email: string | null;
  roles: string[];
  businessId: number | null;
  businessIds: number[];
};

type DeliveryAccess = {
  allowed: boolean;
};

type OrdersListRow = RowDataPacket & {
  id: number;
  user_id: number;
  customer_name: string | null;
  customer_phone: string | null;
  business_name: string | null;
  total_amount: string | number | null;
  subtotal: string | number | null;
  terminal_fee: string | number | null;
  delivery_fee: string | number | null;
  service_fee: string | number | null;
  platform_fee: string | number | null;
  driver_fee: string | number | null;
  payment_method: string | null;
  payment_receipt_url?: string | null;
  created_at: string;
  address_id: number;
  street: string | null;
  external_number: string | null;
  internal_number: string | null;
  neighborhood: string | null;
  city: string | null;
  state: string | null;
  status_name: string | null;
};

type OrderItemRow = RowDataPacket & {
  id: number;
  product_id: number;
  product_name: string | null;
  quantity: number;
  unit_price: string | number | null;
  subtotal: string | number | null;
  notes: string | null;
};

type AdminMessageRow = RowDataPacket & {
  id: number;
  type: string | null;
  message: string | null;
  file_url: string | null;
  created_at: string;
};

export type OrdersGetDependencies = {
  requireAuthenticatedUser: (req: OrdersRouteRequest) => Promise<
    | {
        ok: false;
        response: JsonResponse;
      }
    | {
        ok: true;
        access: PermissionAccess;
      }
  >;
  resolveBusinessAccess: (
    userId: number,
    requestedBusinessId?: number | null,
  ) => Promise<BusinessAccess>;
  resolveDeliveryAccess: (userId: number) => Promise<DeliveryAccess>;
  ensureOrdersColumns: () => Promise<void>;
  ensureOrderItemsTable: () => Promise<void>;
  ensureCoreOrderStatuses: () => Promise<void>;
  ensureAdminMessagesTable: () => Promise<void>;
  logDbUsage: (
    endpoint: string,
    payload?: {
      userId?: number | null;
      email?: string | null;
      role?: string | string[] | null;
    },
  ) => void;
  query: (sql: string, params?: Array<string | number>) => Promise<unknown[][]>;
  resolveCanonicalOrderStatus: (value: unknown) => string;
  getOrderStatusLabel: (value: unknown) => string;
};

function toPositiveNumber(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function forbidden(jsonResponse: JsonResponseFactory) {
  return jsonResponse(
    {
      success: false,
      error: "No tienes permiso para consultar estos pedidos.",
    },
    { status: 403 },
  );
}

function internalError(jsonResponse: JsonResponseFactory) {
  return jsonResponse(
    {
      success: false,
      error: "No pudimos cargar tus pedidos. Intenta nuevamente.",
    },
    { status: 500 },
  );
}

function buildAddressParts(order: OrdersListRow) {
  return [
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
}

export function createOrdersGetHandler(
  jsonResponse: JsonResponseFactory,
  dependencies: OrdersGetDependencies,
) {
  return async function GET(req: OrdersRouteRequest) {
    try {
      const auth = await dependencies.requireAuthenticatedUser(req);
      if (!auth.ok) {
        return auth.response;
      }

      await dependencies.ensureOrdersColumns();
      await dependencies.ensureOrderItemsTable();
      await dependencies.ensureCoreOrderStatuses();
      await dependencies.ensureAdminMessagesTable();

      dependencies.logDbUsage("/api/orders", {
        userId: auth.access.userId,
        email: auth.access.email,
        role: auth.access.roles,
      });

      const { searchParams } = new URL(req.url);
      const requestedUserId = toPositiveNumber(searchParams.get("user_id"));
      const requestedBusinessId = toPositiveNumber(
        searchParams.get("business_id"),
      );
      const requestedDeliveryUserId = toPositiveNumber(
        searchParams.get("delivery_id"),
      );
      const statusId = toPositiveNumber(searchParams.get("status_id"));
      const limitParam = Number(searchParams.get("limit") ?? 50);
      const limit = Number.isFinite(limitParam)
        ? Math.min(Math.max(limitParam, 1), 100)
        : 50;
      const isAdminGeneral = auth.access.roles.includes("ADMIN_GENERAL");

      const filters: string[] = [];
      const values: Array<string | number> = [];

      if (isAdminGeneral) {
        if (requestedUserId) {
          filters.push("o.user_id = ?");
          values.push(requestedUserId);
        }

        if (requestedBusinessId) {
          filters.push("o.business_id = ?");
          values.push(requestedBusinessId);
        }

        if (requestedDeliveryUserId) {
          filters.push("COALESCE(o.driver_id, d.driver_user_id) = ?");
          values.push(requestedDeliveryUserId);
        }
      } else if (requestedBusinessId) {
        if (requestedUserId || requestedDeliveryUserId) {
          return forbidden(jsonResponse);
        }

        const businessAccess = await dependencies.resolveBusinessAccess(
          auth.access.userId,
          requestedBusinessId,
        );

        if (
          !businessAccess.businessId ||
          !businessAccess.businessIds.includes(requestedBusinessId)
        ) {
          return forbidden(jsonResponse);
        }

        filters.push("o.business_id = ?");
        values.push(requestedBusinessId);
      } else if (requestedDeliveryUserId) {
        if (requestedUserId) {
          return forbidden(jsonResponse);
        }

        const deliveryAccess = await dependencies.resolveDeliveryAccess(
          auth.access.userId,
        );

        if (
          !deliveryAccess.allowed ||
          requestedDeliveryUserId !== auth.access.userId
        ) {
          return forbidden(jsonResponse);
        }

        filters.push("COALESCE(o.driver_id, d.driver_user_id) = ?");
        values.push(auth.access.userId);
      } else {
        if (requestedUserId && requestedUserId !== auth.access.userId) {
          return forbidden(jsonResponse);
        }

        filters.push("o.user_id = ?");
        values.push(auth.access.userId);
      }

      if (statusId) {
        filters.push("o.order_status_id = ?");
        values.push(statusId);
      }

      values.push(limit);

      const [ordersRaw] = await dependencies.query(
        `
          SELECT
            o.id,
            o.user_id,
            CONCAT(u.first_name, ' ', COALESCE(u.last_name, '')) AS customer_name,
            u.phone AS customer_phone,
            o.business_id,
            b.name AS business_name,
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
            COALESCE(o.payment_receipt_url, o.comprobante_pago_url) AS payment_receipt_url,
            o.created_at,
            o.updated_at,
            COUNT(oi.id) AS items_count
          FROM orders o
          LEFT JOIN users u ON u.id = o.user_id
          LEFT JOIN business b ON b.id = o.business_id
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
      const orders = ordersRaw as OrdersListRow[];

      const normalizedOrders = await Promise.all(
        orders.map(async (order) => {
          const [itemsRaw] = await dependencies.query(
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
            [Number(order.id)],
          );
          const items = itemsRaw as OrderItemRow[];

          const [adminMessagesRaw] = await dependencies.query(
            `
              SELECT id, order_id, user_id, type, message, file_url, created_at
              FROM admin_messages
              WHERE order_id = ?
              ORDER BY created_at ASC
            `,
            [Number(order.id)],
          );
          const adminMessages = adminMessagesRaw as AdminMessageRow[];

          return {
            id: Number(order.id),
            status: dependencies.resolveCanonicalOrderStatus(order.status_name),
            statusLabel: dependencies.getOrderStatusLabel(order.status_name),
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
              fullAddress: buildAddressParts(order).join(", "),
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
              type: String(message.type ?? ""),
              message: String(message.message ?? ""),
              fileUrl: message.file_url ? String(message.file_url) : "",
              createdAt: message.created_at,
            })),
          };
        }),
      );

      return jsonResponse(
        { success: true, orders: normalizedOrders },
        { status: 200 },
      );
    } catch {
      return internalError(jsonResponse);
    }
  };
}
