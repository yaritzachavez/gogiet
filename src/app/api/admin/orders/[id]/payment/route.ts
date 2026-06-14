import { type NextRequest, NextResponse } from "next/server";
import {
  getRequestId,
  getSafeErrorMessage,
  getStatusForErrorCode,
  logServerError,
} from "@/lib/api-error";
import { recordAuditLog } from "@/lib/audit-log";
import pool from "@/lib/db";
import { createNotificationForBusinessSafely } from "@/lib/notifications";
import {
  ensureOrderPaymentColumns,
  ensurePaymentsTable,
  upsertPaymentRecord,
} from "@/lib/order-payments";
import { resolveCanonicalOrderStatus } from "@/lib/order-status";
import {
  applyValidatedOrderStatusTransition,
  OrderStatusTransitionError,
  validateOrderStatusTransition,
} from "@/lib/order-status-guard";
import { requirePermission } from "@/lib/permissions";
import { addSupportMessage, getOrCreateSupportThread } from "@/lib/support";

import { createAdminOrderPaymentHandler } from "./handler";

const handler = createAdminOrderPaymentHandler<Response>(
  (body, init) => NextResponse.json(body, init),
  {
    authorize: async (request) => {
      const access = await requirePermission(
        request as NextRequest,
        "VALIDATE_PAYMENT",
        undefined,
        "No tienes permiso para validar pagos.",
      );

      if (!access.ok) {
        return {
          ok: false as const,
          status: access.response.status as 401 | 403,
        };
      }

      return {
        ok: true as const,
        access: { userId: access.access.userId },
      };
    },
    query: async <T>(query: string, params?: Array<number | string | null>) => {
      void (0 as T | undefined);
      const [rows] = await pool.query(query, params);
      return [rows];
    },
    getConnection: () => pool.getConnection(),
    ensureOrderPaymentColumns: async (connection) =>
      ensureOrderPaymentColumns(connection as never),
    ensurePaymentsTable: async (connection) =>
      ensurePaymentsTable(connection as never),
    resolveCanonicalOrderStatus,
    validateOrderStatusTransition,
    applyValidatedOrderStatusTransition: async (connection, params) =>
      applyValidatedOrderStatusTransition(connection as never, params as never),
    upsertPaymentRecord: async (connection, payload) =>
      upsertPaymentRecord(connection as never, payload as never),
    getOrCreateSupportThread: async (params) =>
      getOrCreateSupportThread(params),
    addSupportMessage: async (params) =>
      addSupportMessage({
        threadId: Number(params.threadId),
        senderId: params.senderId,
        senderType: params.senderType,
        message: params.message,
        messageType: params.messageType,
      }),
    recordAuditLog: async (payload, connection) =>
      recordAuditLog(payload as never, connection as never),
    createNotificationForBusinessSafely: async (
      businessId,
      payload,
      connection,
    ) =>
      createNotificationForBusinessSafely(
        businessId,
        payload as never,
        connection as never,
      ),
    getRequestId,
    logServerError: (event, error, context) =>
      logServerError(event, error, {
        request: context.request,
        userId: context.userId,
        orderId: context.orderId,
        action: context.action,
      }),
    resolveKnownError: (error) => {
      if (error instanceof OrderStatusTransitionError) {
        return {
          status: error.statusCode,
          message: getSafeErrorMessage(
            error,
            "No fue posible procesar la información del pago",
          ),
        };
      }

      const errorLike = error as { statusCode?: unknown; code?: unknown };
      const statusCode = Number(errorLike?.statusCode ?? 0);
      const code = String(errorLike?.code ?? "").toUpperCase();

      if (statusCode === 404 || code === "NOT_FOUND") {
        return { status: 404, message: "Pedido no encontrado" };
      }

      if (statusCode >= 400 && statusCode < 500) {
        return {
          status: statusCode,
          message: getSafeErrorMessage(
            error,
            "No fue posible procesar la información del pago",
          ),
        };
      }

      if (getStatusForErrorCode("SERVICE_UNAVAILABLE") === statusCode) {
        return {
          status: statusCode,
          message: "No fue posible procesar la información del pago",
        };
      }

      return null;
    },
  },
);

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  return handler(req, context);
}
