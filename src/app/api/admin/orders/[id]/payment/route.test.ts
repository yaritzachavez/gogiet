import assert from "node:assert/strict";
import test from "node:test";

import { createAdminOrderPaymentHandler } from "./handler.ts";

const FORBIDDEN_KEYS = new Set([
  "debug",
  "details",
  "stack",
  "cause",
  "query",
  "sql",
  "databaseHost",
  "databaseName",
  "accessToken",
  "access_token",
  "authorization",
  "cardToken",
  "card_token",
  "cvv",
  "password",
]);

const FORBIDDEN_SNIPPETS = [
  "Unknown column users.password_hash",
  "Table gogi_prod.orders doesn't exist",
  "ECONNREFUSED",
  "Access token rejected",
  "SQL syntax error",
  "prisma",
  "mysql",
  "MercadoPagoConfig",
];

function createRequest(body?: unknown) {
  return {
    url: "https://example.com/api/admin/orders/9/payment",
    headers: {
      get(name: string) {
        const normalized = name.toLowerCase();
        if (normalized === "x-request-id") return "req-admin-order-payment";
        if (normalized === "x-forwarded-for") return "127.0.0.1";
        if (normalized === "user-agent") return "node-test";
        return null;
      },
    },
    json: async () => body,
  };
}

function createJsonResponse(body: unknown, init: { status: number }) {
  return {
    status: init.status,
    async json(): Promise<unknown> {
      return body;
    },
  };
}

function assertNoForbiddenPayload(value: unknown) {
  const serialized = JSON.stringify(value);
  for (const snippet of FORBIDDEN_SNIPPETS) {
    assert.equal(
      serialized.toLowerCase().includes(snippet.toLowerCase()),
      false,
      `response unexpectedly contains forbidden snippet "${snippet}"`,
    );
  }

  if (Array.isArray(value)) {
    for (const entry of value) {
      assertNoForbiddenPayload(entry);
    }
    return;
  }

  if (!value || typeof value !== "object") {
    return;
  }

  for (const [key, nestedValue] of Object.entries(
    value as Record<string, unknown>,
  )) {
    assert.equal(
      FORBIDDEN_KEYS.has(key),
      false,
      `response unexpectedly contains forbidden key "${key}"`,
    );
    assertNoForbiddenPayload(nestedValue);
  }
}

function createConnection(
  overrides: Partial<{
    beginTransaction: () => Promise<void>;
    query: <T = unknown>(
      query: string,
      params?: Array<number | string | null>,
    ) => Promise<[T, unknown?]>;
    commit: () => Promise<void>;
    rollback: () => Promise<void>;
    release: () => void;
  }> = {},
) {
  return {
    beginTransaction: async () => {},
    query: async () => [{}],
    commit: async () => {},
    rollback: async () => {},
    release: () => {},
    ...overrides,
  };
}

function createDependencies(
  overrides: Partial<Parameters<typeof createAdminOrderPaymentHandler>[1]> = {},
) {
  return {
    authorize: async () => ({ ok: true as const, access: { userId: 99 } }),
    query: async () => {
      throw new Error("query mock not configured");
    },
    getConnection: async () => createConnection(),
    ensureOrderPaymentColumns: async () => {},
    ensurePaymentsTable: async () => {},
    resolveCanonicalOrderStatus: () => "payment_review",
    validateOrderStatusTransition: () => ({
      currentStatus: "payment_review",
      nextStatus: "paid",
      changedByRole: "admin",
    }),
    applyValidatedOrderStatusTransition: async () => {},
    upsertPaymentRecord: async () => {},
    getOrCreateSupportThread: async () => 55,
    addSupportMessage: async () => {},
    recordAuditLog: async () => {},
    createNotificationForBusinessSafely: async () => {},
    getRequestId: () => "req-admin-order-payment",
    logServerError: () => "req-admin-order-payment",
    resolveKnownError: () => null,
    ...overrides,
  };
}

test("admin order payment returns sanitized 401", async () => {
  const handler = createAdminOrderPaymentHandler(
    createJsonResponse,
    createDependencies({
      authorize: async () => ({ ok: false as const, status: 401 }),
    }),
  );

  const response = await handler(createRequest() as never, {
    params: Promise.resolve({ id: "9" }),
  });
  const body = (await response.json()) as { error: string };

  assert.equal(response.status, 401);
  assert.deepEqual(body, { error: "No autorizado" });
  assertNoForbiddenPayload(body);
});

test("admin order payment returns sanitized 403", async () => {
  const handler = createAdminOrderPaymentHandler(
    createJsonResponse,
    createDependencies({
      authorize: async () => ({ ok: false as const, status: 403 }),
    }),
  );

  const response = await handler(createRequest() as never, {
    params: Promise.resolve({ id: "9" }),
  });
  const body = (await response.json()) as { error: string };

  assert.equal(response.status, 403);
  assert.deepEqual(body, {
    error: "No tienes permisos para realizar esta acción",
  });
  assertNoForbiddenPayload(body);
});

test("admin order payment returns sanitized 404 when order is missing", async () => {
  const handler = createAdminOrderPaymentHandler(
    createJsonResponse,
    createDependencies({
      query: async () => [[]],
    }),
  );

  const response = await handler(
    createRequest({ action: "approve" }) as never,
    { params: Promise.resolve({ id: "9" }) },
  );
  const body = (await response.json()) as { error: string };

  assert.equal(response.status, 404);
  assert.deepEqual(body, { error: "Pedido no encontrado" });
  assertNoForbiddenPayload(body);
});

test("admin order payment returns sanitized validation errors", async () => {
  const baseHandler = createAdminOrderPaymentHandler(
    createJsonResponse,
    createDependencies(),
  );

  const invalidAction = await baseHandler(
    createRequest({ action: "noop" }) as never,
    { params: Promise.resolve({ id: "9" }) },
  );
  const invalidActionBody = (await invalidAction.json()) as { error: string };
  assert.equal(invalidAction.status, 400);
  assert.deepEqual(invalidActionBody, { error: "Acción inválida" });

  const missingReason = await baseHandler(
    createRequest({ action: "reject", reason: "" }) as never,
    { params: Promise.resolve({ id: "9" }) },
  );
  const missingReasonBody = (await missingReason.json()) as { error: string };
  assert.equal(missingReason.status, 400);
  assert.deepEqual(missingReasonBody, {
    error: "Debes indicar un motivo de rechazo",
  });
});

test("admin order payment preserves safe known domain errors", async () => {
  const handler = createAdminOrderPaymentHandler(
    createJsonResponse,
    createDependencies({
      query: async () => [
        [
          {
            id: 9,
            user_id: 31,
            business_id: 3,
            payment_method_id: 4,
            total_amount: 180,
            payment_method: "transferencia",
            status_name: "payment_review",
          },
        ],
      ],
      validateOrderStatusTransition: () => {
        throw new Error("safe-domain");
      },
      resolveKnownError: () => ({
        status: 409,
        message: "Este pedido ya no está pendiente de validación",
      }),
    }),
  );

  const response = await handler(
    createRequest({ action: "approve" }) as never,
    { params: Promise.resolve({ id: "9" }) },
  );
  const body = (await response.json()) as { error: string };

  assert.equal(response.status, 409);
  assert.deepEqual(body, {
    error: "Este pedido ya no está pendiente de validación",
  });
  assertNoForbiddenPayload(body);
});

test("admin order payment returns sanitized 500 for provider-like failures", async () => {
  const handler = createAdminOrderPaymentHandler(
    createJsonResponse,
    createDependencies({
      query: async () => [
        [
          {
            id: 9,
            user_id: 31,
            business_id: 3,
            payment_method_id: 4,
            total_amount: 180,
            payment_method: "transferencia",
            status_name: "payment_review",
          },
        ],
      ],
      upsertPaymentRecord: async () => {
        throw new Error(
          "Access token rejected card_token=abc cvv=123 MercadoPagoConfig SQL syntax error",
        );
      },
    }),
  );

  const response = await handler(
    createRequest({ action: "approve" }) as never,
    { params: Promise.resolve({ id: "9" }) },
  );
  const body = (await response.json()) as { error: string };

  assert.equal(response.status, 500);
  assert.deepEqual(body, {
    error: "No fue posible procesar la información del pago",
  });
  assertNoForbiddenPayload(body);
});

test("admin order payment preserves successful payload", async () => {
  const connection = createConnection();
  const handler = createAdminOrderPaymentHandler(
    createJsonResponse,
    createDependencies({
      getConnection: async () => connection,
      query: async () => [
        [
          {
            id: 9,
            user_id: 31,
            business_id: 3,
            payment_method_id: 4,
            total_amount: 180,
            payment_method: "transferencia",
            status_name: "payment_review",
          },
        ],
      ],
    }),
  );

  const response = await handler(
    createRequest({ action: "approve" }) as never,
    { params: Promise.resolve({ id: "9" }) },
  );
  const body = (await response.json()) as {
    success: boolean;
    message: string;
    status: string;
  };

  assert.equal(response.status, 200);
  assert.equal(body.success, true);
  assert.equal(body.message, "Pago aprobado correctamente");
  assert.equal(body.status, "paid");
});
