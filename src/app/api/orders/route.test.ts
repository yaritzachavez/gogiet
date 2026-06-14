import assert from "node:assert/strict";
import test from "node:test";

import { createOrdersGetHandler } from "./handler.ts";

const FORBIDDEN_KEYS = new Set(["debug", "details", "stack", "query", "sql"]);

function createRequest(url = "https://example.com/api/orders") {
  return { url };
}

function createJsonResponse(body: unknown, init: { status: number }) {
  return {
    status: init.status,
    async json() {
      return body;
    },
  };
}

function assertNoForbiddenKeys(value: unknown) {
  if (Array.isArray(value)) {
    value.forEach(assertNoForbiddenKeys);
    return;
  }

  if (!value || typeof value !== "object") {
    return;
  }

  for (const [key, nestedValue] of Object.entries(
    value as Record<string, unknown>,
  )) {
    assert.equal(FORBIDDEN_KEYS.has(key), false);
    assertNoForbiddenKeys(nestedValue);
  }
}

function createDependencies(
  overrides: Partial<Parameters<typeof createOrdersGetHandler>[1]> = {},
) {
  return {
    requireAuthenticatedUser: async () => ({
      ok: true as const,
      access: {
        userId: 7,
        email: "cliente@gogieats.test",
        roles: ["CLIENTE"],
      },
    }),
    resolveBusinessAccess: async (
      _userId: number,
      requestedBusinessId?: number | null,
    ) => ({
      userId: 7,
      email: "business@gogieats.test",
      roles: ["ADMIN_NEGOCIO"],
      businessId: requestedBusinessId ?? 3,
      businessIds: requestedBusinessId ? [requestedBusinessId] : [3],
    }),
    resolveDeliveryAccess: async () => ({ allowed: true }),
    ensureOrdersColumns: async () => {},
    ensureOrderItemsTable: async () => {},
    ensureCoreOrderStatuses: async () => {},
    ensureAdminMessagesTable: async () => {},
    logDbUsage: () => {},
    query: async (sql: string, _params?: Array<string | number>) => {
      if (sql.includes("GROUP BY o.id")) {
        return [
          [
            {
              id: 11,
              user_id: 7,
              customer_name: "Cliente QA",
              customer_phone: "5551112222",
              business_name: "Negocio QA",
              total_amount: 150,
              subtotal: 120,
              terminal_fee: 0,
              delivery_fee: 20,
              service_fee: 10,
              platform_fee: 6,
              driver_fee: 14,
              payment_method: "efectivo",
              payment_receipt_url: null,
              created_at: "2026-06-01T10:00:00.000Z",
              address_id: 5,
              street: "Calle 1",
              external_number: "10",
              internal_number: null,
              neighborhood: "Centro",
              city: "Mazamitla",
              state: "Jalisco",
              status_name: "pending",
            },
          ],
        ];
      }

      if (sql.includes("FROM order_items oi")) {
        return [
          [
            {
              id: 1,
              product_id: 75,
              product_name: "Producto QA",
              quantity: 2,
              unit_price: 60,
              subtotal: 120,
              notes: "",
            },
          ],
        ];
      }

      if (sql.includes("FROM admin_messages")) {
        return [
          [
            {
              id: 1,
              type: "info",
              message: "ok",
              file_url: null,
              created_at: "2026-06-01T10:00:00.000Z",
            },
          ],
        ];
      }

      throw new Error(`unexpected query: ${sql}`);
    },
    resolveCanonicalOrderStatus: (value: unknown) =>
      String(value ?? "")
        .trim()
        .toLowerCase(),
    getOrderStatusLabel: (value: unknown) => String(value ?? ""),
    ...overrides,
  };
}

test("orders GET returns sanitized 401 without session", async () => {
  const handler = createOrdersGetHandler(
    createJsonResponse,
    createDependencies({
      requireAuthenticatedUser: async () => ({
        ok: false as const,
        response: createJsonResponse(
          { success: false, error: "Necesitas iniciar sesión para continuar." },
          { status: 401 },
        ),
      }),
    }),
  );

  const response = await handler(createRequest());
  const body = await response.json();

  assert.equal(response.status, 401);
  assert.deepEqual(body, {
    success: false,
    error: "Necesitas iniciar sesión para continuar.",
  });
  assertNoForbiddenKeys(body);
});

test("orders GET returns sanitized 401 for invalid session", async () => {
  const handler = createOrdersGetHandler(
    createJsonResponse,
    createDependencies({
      requireAuthenticatedUser: async () => ({
        ok: false as const,
        response: createJsonResponse(
          { success: false, error: "Necesitas iniciar sesión para continuar." },
          { status: 401 },
        ),
      }),
    }),
  );

  const response = await handler(
    createRequest("https://example.com/api/orders?user_id=9"),
  );
  const body = await response.json();

  assert.equal(response.status, 401);
  assert.deepEqual(body, {
    success: false,
    error: "Necesitas iniciar sesión para continuar.",
  });
  assertNoForbiddenKeys(body);
});

test("client gets own orders by default", async () => {
  const handler = createOrdersGetHandler(
    createJsonResponse,
    createDependencies(),
  );

  const response = await handler(createRequest());
  const body = (await response.json()) as {
    success: boolean;
    orders: Array<{ id: number }>;
  };

  assert.equal(response.status, 200);
  assert.equal(body.success, true);
  assert.deepEqual(
    body.orders.map((order) => order.id),
    [11],
  );
});

test("client using own user_id does not expand access", async () => {
  let capturedParams: Array<string | number> | undefined;
  const handler = createOrdersGetHandler(
    createJsonResponse,
    createDependencies({
      query: async (sql: string, params?: Array<string | number>) => {
        if (sql.includes("GROUP BY o.id")) {
          capturedParams = params;
          return [[]];
        }

        return [[]];
      },
    }),
  );

  const response = await handler(
    createRequest("https://example.com/api/orders?user_id=7"),
  );

  assert.equal(response.status, 200);
  assert.deepEqual(capturedParams, [7, 50]);
});

test("client using foreign user_id gets 403", async () => {
  const handler = createOrdersGetHandler(
    createJsonResponse,
    createDependencies(),
  );

  const response = await handler(
    createRequest("https://example.com/api/orders?user_id=9"),
  );
  const body = await response.json();

  assert.equal(response.status, 403);
  assert.deepEqual(body, {
    success: false,
    error: "No tienes permiso para consultar estos pedidos.",
  });
  assertNoForbiddenKeys(body);
});

test("client cannot widen scope with combined parameters", async () => {
  const handler = createOrdersGetHandler(
    createJsonResponse,
    createDependencies(),
  );

  const response = await handler(
    createRequest(
      "https://example.com/api/orders?user_id=9&business_id=3&delivery_id=7",
    ),
  );

  assert.equal(response.status, 403);
});

test("admin can filter by user", async () => {
  let capturedParams: Array<string | number> | undefined;
  const handler = createOrdersGetHandler(
    createJsonResponse,
    createDependencies({
      requireAuthenticatedUser: async () => ({
        ok: true as const,
        access: {
          userId: 1,
          email: "admin@gogieats.test",
          roles: ["ADMIN_GENERAL"],
        },
      }),
      query: async (sql: string, params?: Array<string | number>) => {
        if (sql.includes("GROUP BY o.id")) {
          capturedParams = params;
          return [[]];
        }

        return [[]];
      },
    }),
  );

  const response = await handler(
    createRequest("https://example.com/api/orders?user_id=31"),
  );

  assert.equal(response.status, 200);
  assert.deepEqual(capturedParams, [31, 50]);
});

test("non-admin cannot use administrative user filtering", async () => {
  const handler = createOrdersGetHandler(
    createJsonResponse,
    createDependencies(),
  );

  const response = await handler(
    createRequest("https://example.com/api/orders?user_id=31"),
  );

  assert.equal(response.status, 403);
});

test("business actor can access only authorized business scope", async () => {
  let capturedParams: Array<string | number> | undefined;
  const handler = createOrdersGetHandler(
    createJsonResponse,
    createDependencies({
      requireAuthenticatedUser: async () => ({
        ok: true as const,
        access: {
          userId: 20,
          email: "business@gogieats.test",
          roles: ["ADMIN_NEGOCIO"],
        },
      }),
      query: async (sql: string, params?: Array<string | number>) => {
        if (sql.includes("GROUP BY o.id")) {
          capturedParams = params;
          return [[]];
        }

        return [[]];
      },
    }),
  );

  const response = await handler(
    createRequest("https://example.com/api/orders?business_id=3"),
  );

  assert.equal(response.status, 200);
  assert.deepEqual(capturedParams, [3, 50]);
});

test("business actor cannot access another business", async () => {
  const handler = createOrdersGetHandler(
    createJsonResponse,
    createDependencies({
      requireAuthenticatedUser: async () => ({
        ok: true as const,
        access: {
          userId: 20,
          email: "business@gogieats.test",
          roles: ["ADMIN_NEGOCIO"],
        },
      }),
      resolveBusinessAccess: async () => ({
        userId: 20,
        email: "business@gogieats.test",
        roles: ["ADMIN_NEGOCIO"],
        businessId: null,
        businessIds: [3],
      }),
    }),
  );

  const response = await handler(
    createRequest("https://example.com/api/orders?business_id=4"),
  );

  assert.equal(response.status, 403);
});

test("driver can access only own assigned orders", async () => {
  let capturedParams: Array<string | number> | undefined;
  const handler = createOrdersGetHandler(
    createJsonResponse,
    createDependencies({
      requireAuthenticatedUser: async () => ({
        ok: true as const,
        access: {
          userId: 44,
          email: "driver@gogieats.test",
          roles: ["REPARTIDOR"],
        },
      }),
      query: async (sql: string, params?: Array<string | number>) => {
        if (sql.includes("GROUP BY o.id")) {
          capturedParams = params;
          return [[]];
        }

        return [[]];
      },
    }),
  );

  const response = await handler(
    createRequest("https://example.com/api/orders?delivery_id=44"),
  );

  assert.equal(response.status, 200);
  assert.deepEqual(capturedParams, [44, 50]);
});

test("driver cannot access another driver's orders", async () => {
  const handler = createOrdersGetHandler(
    createJsonResponse,
    createDependencies({
      requireAuthenticatedUser: async () => ({
        ok: true as const,
        access: {
          userId: 44,
          email: "driver@gogieats.test",
          roles: ["REPARTIDOR"],
        },
      }),
    }),
  );

  const response = await handler(
    createRequest("https://example.com/api/orders?delivery_id=45"),
  );

  assert.equal(response.status, 403);
});

test("orders response does not expose pagination or unrelated metadata", async () => {
  const handler = createOrdersGetHandler(
    createJsonResponse,
    createDependencies(),
  );

  const response = await handler(createRequest());
  const body = (await response.json()) as Record<string, unknown>;

  assert.equal(response.status, 200);
  assert.equal("count" in body, false);
  assert.equal("page" in body, false);
  assert.equal("total" in body, false);
});
