type AuthorizationResult =
  | { ok: true; access: { userId: number } }
  | { ok: false; status: 401 | 403 };

type PaymentOrderRow = {
  id: number;
  user_id: number;
  business_id: number;
  payment_method_id: number | null;
  total_amount: number | null;
  payment_method: string | null;
  status_name: string | null;
};

type TransactionConnection = {
  beginTransaction: () => Promise<void>;
  query: (
    query: string,
    params?: Array<number | string | null>,
  ) => Promise<unknown>;
  commit: () => Promise<void>;
  rollback: () => Promise<void>;
  release: () => void;
};

export type AdminOrderPaymentRequest = {
  url?: string;
  headers: Pick<Headers, "get">;
  json: () => Promise<unknown>;
};

export type AdminOrderPaymentContext = {
  params: Promise<{ id: string }>;
};

export type AdminOrderPaymentResponseInit = {
  status: number;
  headers?: Record<string, string>;
};

export type AdminOrderPaymentJsonResponse<TResponse> = (
  body: unknown,
  init: AdminOrderPaymentResponseInit,
) => TResponse;

export type AdminOrderPaymentDependencies = {
  authorize: (
    request: AdminOrderPaymentRequest,
  ) => Promise<AuthorizationResult>;
  query: (
    query: string,
    params?: Array<number | string | null>,
  ) => Promise<unknown>;
  getConnection: () => Promise<TransactionConnection>;
  ensureOrderPaymentColumns: (connection: unknown) => Promise<unknown>;
  ensurePaymentsTable: (connection: unknown) => Promise<unknown>;
  resolveCanonicalOrderStatus: (value: unknown) => string;
  validateOrderStatusTransition: (params: {
    currentStatus: unknown;
    nextStatus: unknown;
    role: "admin";
    order: {
      id: number;
      businessId: number;
      customerUserId: number;
      driverUserId: number | null;
      paymentMethod: string | null;
      currentStatus: string | null;
    };
    actorUserId: number;
    reason?: string | null;
  }) => { currentStatus: string; nextStatus: string; changedByRole: string };
  applyValidatedOrderStatusTransition: (
    connection: unknown,
    params: {
      orderId: number;
      nextStatus: string;
      actorUserId: number;
      actorRole: "admin";
      currentStatus: string;
      reason?: string;
      metadata: Record<string, unknown>;
    },
  ) => Promise<unknown>;
  upsertPaymentRecord: (
    connection: unknown,
    payload: Record<string, unknown>,
  ) => Promise<unknown>;
  getOrCreateSupportThread: (params: {
    userId: number;
    orderId: number;
  }) => Promise<number>;
  addSupportMessage: (params: {
    threadId: number;
    senderId: number;
    senderType: "admin";
    message: string;
    messageType: "text";
  }) => Promise<unknown>;
  recordAuditLog: (
    payload: Record<string, unknown>,
    connection: unknown,
  ) => Promise<unknown>;
  createNotificationForBusinessSafely: (
    businessId: number,
    payload: Record<string, unknown>,
    connection: unknown,
  ) => Promise<unknown>;
  getRequestId: (request: AdminOrderPaymentRequest) => string;
  logServerError: (
    event: string,
    error: unknown,
    context: {
      request: AdminOrderPaymentRequest;
      userId: number | null;
      orderId: number | null;
      action: string | null;
    },
  ) => unknown;
  resolveKnownError: (
    error: unknown,
  ) => { status: number; message: string } | null;
};

function normalizeCatalogName(value: unknown, fallback: string) {
  const normalized = String(value ?? "")
    .trim()
    .toLowerCase();

  return normalized || fallback;
}

function exactErrorResponse<TResponse>(
  request: AdminOrderPaymentRequest,
  status: 400 | 401 | 403 | 404 | 409 | 500,
  message: string,
  jsonResponse: AdminOrderPaymentJsonResponse<TResponse>,
  getRequestId: AdminOrderPaymentDependencies["getRequestId"],
) {
  return jsonResponse(
    { error: message },
    {
      status,
      headers: {
        "x-request-id": getRequestId(request),
      },
    },
  );
}

function logPaymentError(
  request: AdminOrderPaymentRequest,
  event: string,
  error: unknown,
  context: {
    userId: number | null;
    orderId: number | null;
    action: string | null;
  },
  logServerError: AdminOrderPaymentDependencies["logServerError"],
) {
  logServerError(event, error, {
    request,
    userId: context.userId,
    orderId: context.orderId,
    action: context.action,
  });
}

export function createAdminOrderPaymentHandler<TResponse>(
  jsonResponse: AdminOrderPaymentJsonResponse<TResponse>,
  dependencies: AdminOrderPaymentDependencies,
) {
  return async function handler(
    request: AdminOrderPaymentRequest,
    context: AdminOrderPaymentContext,
  ): Promise<TResponse> {
    let orderId: number | null = null;
    let action: string | null = null;
    let actorUserId: number | null = null;

    try {
      const auth = await dependencies.authorize(request);
      if (!auth.ok) {
        return exactErrorResponse(
          request,
          auth.status,
          auth.status === 401
            ? "No autorizado"
            : "No tienes permisos para realizar esta acción",
          jsonResponse,
          dependencies.getRequestId,
        );
      }

      actorUserId = auth.access.userId;

      const { id } = await context.params;
      orderId = Number(id);

      if (!Number.isInteger(orderId) || orderId <= 0) {
        return exactErrorResponse(
          request,
          400,
          "ID inválido",
          jsonResponse,
          dependencies.getRequestId,
        );
      }

      const body = (await request.json()) as {
        action?: unknown;
        reason?: unknown;
      };
      action = String(body?.action ?? "")
        .trim()
        .toLowerCase();
      const reason = String(body?.reason ?? "").trim();

      if (action !== "approve" && action !== "reject") {
        return exactErrorResponse(
          request,
          400,
          "Acción inválida",
          jsonResponse,
          dependencies.getRequestId,
        );
      }

      if (action === "reject" && !reason) {
        return exactErrorResponse(
          request,
          400,
          "Debes indicar un motivo de rechazo",
          jsonResponse,
          dependencies.getRequestId,
        );
      }

      const [rows] = (await dependencies.query(
        `
          SELECT
            o.id,
            o.user_id,
            o.business_id,
            o.payment_method_id,
            o.total_amount,
            COALESCE(o.payment_method, pm.name) AS payment_method,
            osc.name AS status_name
          FROM orders o
          LEFT JOIN payment_methods pm ON pm.id = o.payment_method_id
          LEFT JOIN order_status_catalog osc ON osc.id = o.order_status_id
          WHERE o.id = ?
          LIMIT 1
        `,
        [orderId],
      )) as [PaymentOrderRow[]];

      const order = rows[0];

      if (!order) {
        return exactErrorResponse(
          request,
          404,
          "Pedido no encontrado",
          jsonResponse,
          dependencies.getRequestId,
        );
      }

      if (normalizeCatalogName(order.payment_method, "") !== "transferencia") {
        return exactErrorResponse(
          request,
          400,
          "Solo se pueden validar pagos por transferencia",
          jsonResponse,
          dependencies.getRequestId,
        );
      }

      if (
        dependencies.resolveCanonicalOrderStatus(order.status_name) !==
        "payment_review"
      ) {
        return exactErrorResponse(
          request,
          400,
          "Este pedido ya no está pendiente de validación",
          jsonResponse,
          dependencies.getRequestId,
        );
      }

      const nextStatus = action === "approve" ? "paid" : "cancelled";
      const connection = await dependencies.getConnection();

      try {
        await connection.beginTransaction();
        await dependencies.ensureOrderPaymentColumns(connection);
        await dependencies.ensurePaymentsTable(connection);

        const { currentStatus } = dependencies.validateOrderStatusTransition({
          currentStatus: order.status_name,
          nextStatus,
          role: "admin",
          order: {
            id: orderId,
            businessId: Number(order.business_id),
            customerUserId: Number(order.user_id),
            driverUserId: null,
            paymentMethod: String(order.payment_method ?? ""),
            currentStatus: String(order.status_name ?? ""),
          },
          actorUserId,
          reason,
        });

        await dependencies.applyValidatedOrderStatusTransition(connection, {
          orderId,
          nextStatus,
          actorUserId,
          actorRole: "admin",
          currentStatus,
          reason,
          metadata: {
            endpoint: "/api/admin/orders/[id]/payment",
            action,
            payment_method: "transferencia",
          },
        });

        await connection.query(
          `
            UPDATE orders
            SET
              payment_provider = 'TRANSFER',
              payment_status = ?,
              amount_paid = CASE
                WHEN ? = 'approved' THEN total_amount
                ELSE amount_paid
              END,
              paid_at = CASE
                WHEN ? = 'approved' THEN COALESCE(paid_at, NOW())
                ELSE paid_at
              END,
              updated_at = NOW()
            WHERE id = ?
          `,
          [
            action === "approve" ? "approved" : "rejected",
            action === "approve" ? "approved" : "rejected",
            action === "approve" ? "approved" : "rejected",
            orderId,
          ],
        );

        await dependencies.upsertPaymentRecord(connection, {
          orderId,
          paymentMethodId: Number(order.payment_method_id ?? 0) || null,
          paymentStatus: action === "approve" ? "approved" : "rejected",
          transactionReference: `transfer-order-${orderId}`,
          providerName: "Transferencia",
          provider: "TRANSFER",
          status: action === "approve" ? "approved" : "rejected",
          amount: Number(order.total_amount ?? 0),
          currency: "MXN",
          paidAt: action === "approve" ? new Date() : null,
          processedAt: new Date(),
          rawResponse: {
            action,
            reason: reason || null,
            validatedByUserId: actorUserId,
          },
        });

        const adminMessage =
          action === "approve"
            ? "ADMIN_GENERAL validó correctamente el pago por transferencia."
            : `ADMIN_GENERAL rechazó el pago por transferencia. Motivo: ${reason}`;
        const customerNotice =
          action === "approve"
            ? "Tu pago por transferencia fue validado. Tu pedido quedó pagado y ahora el negocio debe aceptarlo."
            : `Tu pago por transferencia fue rechazado. Motivo: ${reason}`;

        await connection.query(
          `
            INSERT INTO admin_messages (order_id, user_id, type, message, file_url)
            VALUES (?, ?, 'payment_validation', ?, NULL)
          `,
          [orderId, actorUserId, adminMessage],
        );

        await connection.query(
          `
            INSERT INTO order_notes (order_id, user_id, note_type, note_text)
            VALUES (?, ?, 'system', ?)
          `,
          [orderId, actorUserId, customerNotice],
        );

        const supportThreadId = await dependencies.getOrCreateSupportThread({
          userId: Number(order.user_id),
          orderId,
        });

        await dependencies.addSupportMessage({
          threadId: supportThreadId,
          senderId: actorUserId,
          senderType: "admin",
          message:
            action === "approve"
              ? "Pago por transferencia aprobado por ADMIN_GENERAL."
              : `Pago por transferencia rechazado por ADMIN_GENERAL. Motivo: ${reason}`,
          messageType: "text",
        });

        await dependencies.recordAuditLog(
          {
            userId: actorUserId,
            action:
              action === "approve" ? "VALIDATE_PAYMENT" : "REJECT_PAYMENT",
            resourceType: "order",
            resourceId: orderId,
            oldValue: {
              status: order.status_name,
              payment_method: order.payment_method,
            },
            newValue: {
              status: nextStatus,
              reason,
            },
            ip: request.headers.get("x-forwarded-for"),
            userAgent: request.headers.get("user-agent"),
          },
          connection,
        );

        if (action === "approve") {
          await dependencies.createNotificationForBusinessSafely(
            Number(order.business_id),
            {
              type: "pago",
              title: `Pago validado #${orderId}`,
              message:
                "El pago por transferencia fue validado. El negocio ya puede aceptarlo.",
              relatedId: orderId,
              dataJson: {
                order_id: orderId,
                status: nextStatus,
                payment_method: "transferencia",
              },
            },
            connection,
          );
        }

        await connection.commit();
      } catch (error) {
        await connection.rollback();
        throw error;
      } finally {
        connection.release();
      }

      return jsonResponse(
        {
          success: true,
          message:
            action === "approve"
              ? "Pago aprobado correctamente"
              : "Pago rechazado correctamente",
          status: nextStatus,
        },
        { status: 200 },
      );
    } catch (error) {
      const knownError = dependencies.resolveKnownError(error);
      if (knownError) {
        return exactErrorResponse(
          request,
          knownError.status as 400 | 403 | 404 | 409,
          knownError.message,
          jsonResponse,
          dependencies.getRequestId,
        );
      }

      logPaymentError(
        request,
        "admin.order_payment.patch_error",
        error,
        {
          userId: actorUserId,
          orderId,
          action,
        },
        dependencies.logServerError,
      );
      return exactErrorResponse(
        request,
        500,
        "No fue posible procesar la información del pago",
        jsonResponse,
        dependencies.getRequestId,
      );
    }
  };
}
