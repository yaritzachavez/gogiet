import assert from "node:assert/strict";
import test from "node:test";

import { createBusinessMeHandler } from "./handler.ts";

const FORBIDDEN_KEYS = new Set([
  "debug",
  "details",
  "stack",
  "databaseHost",
  "databaseName",
  "query",
  "cause",
]);

function createRequest(url = "https://example.com/api/business/me") {
  const request = {
    url,
    nextUrl: new URL(url),
    headers: {
      get(name: string) {
        return name.toLowerCase() === "x-request-id" ? "req-business-me" : null;
      },
    },
    cookies: {
      get() {
        return undefined;
      },
    },
  };

  return request;
}

function createJsonResponse(body: unknown, init: { status: number }) {
  return {
    status: init.status,
    async json(): Promise<unknown> {
      return body;
    },
  };
}

function assertNoForbiddenKeys(value: unknown) {
  if (Array.isArray(value)) {
    for (const entry of value) {
      assertNoForbiddenKeys(entry);
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
    assertNoForbiddenKeys(nestedValue);
  }
}

function createDependencies(
  overrides: Partial<Parameters<typeof createBusinessMeHandler>[1]> = {},
) {
  return {
    ensureBusinessLogoColumn: async () => "logo_url" as const,
    getAuthUser: () => ({ token: "token", user: { id: 12 } }),
    resolveBusinessAccess: async () => ({
      userId: 12,
      email: "owner@gogieats.test",
      roles: ["cliente"],
      businessId: 3,
      businessIds: [3],
      businesses: [
        { id: 3, name: "QA Business", city: "CDMX", source: "owner" as const },
      ],
      selectedBusinessSource: "owner" as const,
      requestedBusinessId: null,
      denialReason: null,
      isAdmin: false,
    }),
    ensureBusinessHoursSchema: async () => {},
    logDbUsage: () => {},
    query: async () => {
      throw new Error("query mock not configured");
    },
    getBusinessLogoSelect: () => "b.logo_url",
    isBusinessOpenByHours: () => true,
    getRequestId: () => "req-business-me",
    logServerError: () => "req-business-me",
    pool: {},
    ...overrides,
  };
}

test("business/me responds with exact sanitized 401 when no session exists", async () => {
  const handler = createBusinessMeHandler(
    createJsonResponse,
    createDependencies({
      getAuthUser: () => ({ token: null, user: null }),
    }),
  );

  const response = await handler(createRequest() as never);
  const body = (await response.json()) as { error: string };

  assert.equal(response.status, 401);
  assert.deepEqual(body, { error: "No autorizado" });
  assertNoForbiddenKeys(body);
});

test("business/me responds with exact sanitized 401 for invalid session", async () => {
  const handler = createBusinessMeHandler(
    createJsonResponse,
    createDependencies({
      getAuthUser: () => ({ token: "invalid-token", user: null }),
    }),
  );

  const response = await handler(createRequest() as never);
  const body = (await response.json()) as { error: string };

  assert.equal(response.status, 401);
  assert.deepEqual(body, { error: "No autorizado" });
  assertNoForbiddenKeys(body);
});

test("business/me responds with exact sanitized 403 when user has no business access", async () => {
  const handler = createBusinessMeHandler(
    createJsonResponse,
    createDependencies({
      resolveBusinessAccess: async () => ({
        userId: 12,
        email: "cliente@gogieats.test",
        roles: ["cliente"],
        businessId: null,
        businessIds: [],
        businesses: [],
        selectedBusinessSource: null,
        requestedBusinessId: null,
        denialReason: "not_assigned" as const,
        isAdmin: false,
      }),
    }),
  );

  const response = await handler(createRequest() as never);
  const body = (await response.json()) as { error: string };

  assert.equal(response.status, 403);
  assert.deepEqual(body, { error: "No tienes acceso a este negocio" });
  assertNoForbiddenKeys(body);
});

test("business/me responds with exact sanitized 500 for unexpected internal errors", async () => {
  const handler = createBusinessMeHandler(
    createJsonResponse,
    createDependencies({
      ensureBusinessLogoColumn: async () => {
        throw new Error(
          "databaseHost=gogi-eats-db.gogieats2305 column owner_id query SELECT * FROM business",
        );
      },
    }),
  );

  const response = await handler(createRequest() as never);
  const body = (await response.json()) as { error: string };

  assert.equal(response.status, 500);
  assert.deepEqual(body, {
    error: "No fue posible obtener la información del negocio",
  });
  assert.equal(JSON.stringify(body).includes("databaseHost"), false);
  assert.equal(JSON.stringify(body).includes("owner_id"), false);
  assertNoForbiddenKeys(body);
});

test("business/me keeps the authorized payload functional and sanitized", async () => {
  const queryResults = [
    [
      {
        id: 3,
        name: "QA Business",
        logo_url: null,
        business_category_id: 8,
        category_name: "Tacos",
        city: "CDMX",
        district: "Centro",
        address: "Calle 1",
        phone: "5555",
        email: "qa-business@gogieats.test",
        legal_name: "QA Business SA",
        tax_id: "XAXX010101000",
        address_notes: "Puerta roja",
        created_at: "2026-01-01",
        updated_at: "2026-06-01",
        status_id: 1,
        is_open_now: 1,
        owner_id: 12,
      },
    ],
    [
      {
        day_of_week: 0,
        open_time: "09:00:00",
        close_time: "18:00:00",
        is_closed: 0,
        is_24_hours: 0,
      },
    ],
    [{ total: 11 }],
    [{ total: 4 }],
    [{ total: 9 }],
    [{ total: 2 }],
  ];

  const handler = createBusinessMeHandler(
    createJsonResponse,
    createDependencies({
      query: async () => {
        const rows = queryResults.shift();
        assert.ok(rows, "expected query result to be available");
        return [rows] as never;
      },
    }),
  );

  const response = await handler(createRequest() as never);
  const body = (await response.json()) as {
    success: boolean;
    business: { id: number };
    businesses: Array<{
      id: number;
      name: string;
      city: string | null;
      source: string;
    }>;
    products_count: number;
    active_orders_count: number;
    completed_orders_count: number;
    critical_inventory_count: number;
  };

  assert.equal(response.status, 200);
  assert.equal(body.success, true);
  assert.equal(body.business.id, 3);
  assert.equal(body.products_count, 11);
  assert.equal(body.active_orders_count, 4);
  assert.equal(body.completed_orders_count, 9);
  assert.equal(body.critical_inventory_count, 2);
  assert.deepEqual(body.businesses, [
    { id: 3, name: "QA Business", city: "CDMX", source: "owner" },
  ]);
  assertNoForbiddenKeys(body);
});
