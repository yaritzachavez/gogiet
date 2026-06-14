import assert from "node:assert/strict";
import test from "node:test";

import { createAdminBusinessHandlers } from "./handler.ts";

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
    url: "https://example.com/api/admin/business",
    headers: {
      get(name: string) {
        return name.toLowerCase() === "x-request-id"
          ? "req-admin-business"
          : null;
      },
    },
    cookies: {
      get() {
        return undefined;
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
  overrides: Partial<
    Awaited<
      ReturnType<
        Parameters<typeof createAdminBusinessHandlers>[1]["getConnection"]
      >
    >
  > = {},
) {
  return {
    beginTransaction: async () => {},
    query: async () => [{ insertId: 15 }],
    commit: async () => {},
    rollback: async () => {},
    release: () => {},
    ...overrides,
  };
}

function createDependencies(
  overrides: Partial<Parameters<typeof createAdminBusinessHandlers>[1]> = {},
) {
  return {
    getAuthUser: () => ({ id: 1 }),
    isAdminGeneral: async () => true,
    query: async () => {
      throw new Error("query mock not configured");
    },
    getConnection: async () => createConnection(),
    syncBusinessOwnerSafely: async () => ({ alreadyAssigned: false }),
    getRequestId: () => "req-admin-business",
    logServerError: () => "req-admin-business",
    ...overrides,
  };
}

test("admin/business GET returns sanitized 401 without session", async () => {
  const handlers = createAdminBusinessHandlers(
    createJsonResponse,
    createDependencies({ getAuthUser: () => null }),
  );

  const response = await handlers.GET(createRequest() as never);
  const body = (await response.json()) as { error: string };
  assert.equal(response.status, 401);
  assert.deepEqual(body, { error: "No autorizado" });
  assertNoForbiddenPayload(body);
});

test("admin/business GET returns sanitized 403 without permission", async () => {
  const handlers = createAdminBusinessHandlers(
    createJsonResponse,
    createDependencies({ isAdminGeneral: async () => false }),
  );

  const response = await handlers.GET(createRequest() as never);
  const body = (await response.json()) as { error: string };
  assert.equal(response.status, 403);
  assert.deepEqual(body, {
    error: "No tienes permisos para realizar esta acción",
  });
  assertNoForbiddenPayload(body);
});

test("admin/business GET returns sanitized 500 on unexpected errors", async () => {
  const handlers = createAdminBusinessHandlers(
    createJsonResponse,
    createDependencies({
      query: async () => {
        throw new Error(
          "Unknown column users.password_hash SQL syntax error Table gogi_prod.orders doesn't exist",
        );
      },
    }),
  );

  const response = await handlers.GET(createRequest() as never);
  const body = (await response.json()) as { error: string };
  assert.equal(response.status, 500);
  assert.deepEqual(body, {
    error: "No fue posible obtener la información de los negocios",
  });
  assertNoForbiddenPayload(body);
});

test("admin/business GET preserves successful payload", async () => {
  const handlers = createAdminBusinessHandlers(
    createJsonResponse,
    createDependencies({
      query: async () => [
        [
          {
            id: 2,
            name: "Negocio QA",
            legal_name: "Negocio QA SA",
            city: "CDMX",
            district: "Centro",
            address: "Calle 1",
            address_notes: "Puerta roja",
            status_id: 1,
            is_open: 1,
            business_category_id: 3,
            category_name: "Tacos",
            owner_id: 9,
            created_at: "2026-01-01",
            updated_at: "2026-06-01",
          },
        ],
      ],
    }),
  );

  const response = await handlers.GET(createRequest() as never);
  const body = (await response.json()) as {
    success: boolean;
    businesses: Array<{ id: number; name: string; owner_id: number | null }>;
  };

  assert.equal(response.status, 200);
  assert.equal(body.success, true);
  assert.equal(body.businesses[0]?.id, 2);
  assert.equal(body.businesses[0]?.owner_id, 9);
});

test("admin/business POST returns sanitized validation error", async () => {
  const handlers = createAdminBusinessHandlers(
    createJsonResponse,
    createDependencies(),
  );

  const response = await handlers.POST(
    createRequest({ name: "", city: "", owner_id: null }) as never,
  );
  const body = (await response.json()) as { error: string };

  assert.equal(response.status, 400);
  assert.deepEqual(body, {
    error: "owner_id, name, category y city son requeridos",
  });
  assertNoForbiddenPayload(body);
});

test("admin/business POST returns sanitized 500 on unexpected errors", async () => {
  const connection = createConnection({
    query: async () => {
      throw new Error("ECONNREFUSED mysql Access token rejected");
    },
  });

  const handlers = createAdminBusinessHandlers(
    createJsonResponse,
    createDependencies({
      getConnection: async () => connection,
      query: async () => [[{ id: 3 }]],
    }),
  );

  const response = await handlers.POST(
    createRequest({
      owner_id: 8,
      name: "Negocio QA",
      business_category_id: 3,
      city: "CDMX",
    }) as never,
  );
  const body = (await response.json()) as { error: string };

  assert.equal(response.status, 500);
  assert.deepEqual(body, {
    error: "No fue posible crear el negocio",
  });
  assertNoForbiddenPayload(body);
});

test("admin/business POST preserves successful payload", async () => {
  const connection = createConnection({
    query: async (sql) => {
      if (String(sql).includes("INSERT INTO business")) {
        return [{ insertId: 15 }];
      }
      return [{}];
    },
  });

  const handlers = createAdminBusinessHandlers(
    createJsonResponse,
    createDependencies({
      getConnection: async () => connection,
      query: async (sql) => {
        if (String(sql).includes("SELECT id FROM business_categories")) {
          return [[{ id: 3 }]];
        }

        if (String(sql).includes("WHERE b.id = ?")) {
          return [
            [
              {
                id: 15,
                name: "Negocio QA",
                legal_name: "Negocio QA SA",
                city: "CDMX",
                district: null,
                address: "CDMX",
                address_notes: null,
                status_id: 1,
                is_open: 1,
                business_category_id: 3,
                category_name: "Tacos",
                owner_id: 8,
                created_at: "2026-01-01",
                updated_at: "2026-06-01",
              },
            ],
          ];
        }

        return [[]];
      },
    }),
  );

  const response = await handlers.POST(
    createRequest({
      owner_id: 8,
      name: "Negocio QA",
      business_category_id: 3,
      city: "CDMX",
    }) as never,
  );
  const body = (await response.json()) as {
    success: boolean;
    message: string;
    owner_assignment_message: string;
    business: { id: number; owner_id: number | null };
  };

  assert.equal(response.status, 201);
  assert.equal(body.success, true);
  assert.equal(body.business.id, 15);
  assert.equal(body.business.owner_id, 8);
  assert.equal(body.message, "Negocio creado correctamente");
  assert.equal(body.owner_assignment_message, "Dueño asignado correctamente");
});
