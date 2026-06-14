import assert from "node:assert/strict";
import test from "node:test";

import { createBusinessUsersSearchHandler } from "./handler.ts";

const FORBIDDEN_KEYS = new Set([
  "debug",
  "details",
  "stack",
  "query",
  "sql",
  "email",
  "phone",
]);

function createRequest(
  url = "https://example.com/api/business/users/search?business_id=3&q=qa",
) {
  return {
    url,
    nextUrl: new URL(url),
  };
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
    assert.equal(FORBIDDEN_KEYS.has(key), false, `forbidden key ${key}`);
    assertNoForbiddenKeys(nestedValue);
  }
}

function createDependencies(
  overrides: Partial<
    Parameters<typeof createBusinessUsersSearchHandler>[1]
  > = {},
) {
  return {
    requireSellerAccess: async () => ({
      ok: true as const,
      access: {
        userId: 7,
        email: "business@gogieats.test",
        roles: ["ADMIN_NEGOCIO"],
      },
      businessAccess: {
        userId: 7,
        email: "business@gogieats.test",
        roles: ["ADMIN_NEGOCIO"],
        businessId: 3,
        businessIds: [3],
      },
    }),
    logDbUsage: () => {},
    query: async (sql: string, params?: Array<string | number>) => {
      assert.match(sql, /business_owners/);
      assert.match(sql, /business_managers/);
      assert.match(sql, /orders/);
      assert.deepEqual(params?.slice(0, 3), [3, 3, 3]);

      return [
        [
          {
            id: 17,
            first_name: "QA",
            last_name: "Seller",
            email: "qa-seller@gogieats.test",
          },
        ],
      ];
    },
    ...overrides,
  };
}

test("business/users/search returns sanitized 401 without session", async () => {
  const handler = createBusinessUsersSearchHandler(
    createJsonResponse,
    createDependencies({
      requireSellerAccess: async () => ({
        ok: false as const,
        response: createJsonResponse(
          {
            success: false,
            error: "Necesitas iniciar sesión para continuar.",
            users: [],
          },
          { status: 401 },
        ),
      }),
    }),
  );

  const response = await handler(createRequest());
  const body = await response.json();

  assert.equal(response.status, 401);
  assertNoForbiddenKeys(body);
});

test("client cannot use business user search", async () => {
  const handler = createBusinessUsersSearchHandler(
    createJsonResponse,
    createDependencies({
      requireSellerAccess: async () => ({
        ok: false as const,
        response: createJsonResponse(
          {
            success: false,
            error: "No tienes permiso para buscar usuarios de este negocio.",
            users: [],
          },
          { status: 403 },
        ),
      }),
    }),
  );

  const response = await handler(createRequest());
  assert.equal(response.status, 403);
});

test("business user search requires authorized business scope", async () => {
  const handler = createBusinessUsersSearchHandler(
    createJsonResponse,
    createDependencies({
      requireSellerAccess: async () => ({
        ok: true as const,
        access: {
          userId: 7,
          email: "business@gogieats.test",
          roles: ["ADMIN_NEGOCIO"],
        },
        businessAccess: {
          userId: 7,
          email: "business@gogieats.test",
          roles: ["ADMIN_NEGOCIO"],
          businessId: null,
          businessIds: [3],
        },
      }),
    }),
  );

  const response = await handler(
    createRequest(
      "https://example.com/api/business/users/search?business_id=4&q=qa",
    ),
  );

  assert.equal(response.status, 403);
});

test("business user search returns only minimal approved fields", async () => {
  const handler = createBusinessUsersSearchHandler(
    createJsonResponse,
    createDependencies(),
  );

  const response = await handler(createRequest());
  const body = (await response.json()) as {
    success: boolean;
    users: Array<{ id: number; name: string; identifier: string }>;
  };

  assert.equal(response.status, 200);
  assert.equal(body.success, true);
  assert.deepEqual(body.users[0], {
    id: 17,
    name: "QA Seller",
    identifier: "qa***@go***st",
  });
  assertNoForbiddenKeys(body);
});

test("business user search rejects empty queries without querying relations", async () => {
  let queryCalled = false;
  const handler = createBusinessUsersSearchHandler(
    createJsonResponse,
    createDependencies({
      query: async () => {
        queryCalled = true;
        return [[]];
      },
    }),
  );

  const response = await handler(
    createRequest(
      "https://example.com/api/business/users/search?business_id=3&q=a",
    ),
  );
  const body = (await response.json()) as { users: unknown[] };

  assert.equal(response.status, 200);
  assert.equal(queryCalled, false);
  assert.deepEqual(body.users, []);
});

test("business user search clamps limit to prevent mass enumeration", async () => {
  let capturedLimit: string | number | undefined;
  const handler = createBusinessUsersSearchHandler(
    createJsonResponse,
    createDependencies({
      query: async (_sql: string, params?: Array<string | number>) => {
        capturedLimit = params?.[7];
        return [[]];
      },
    }),
  );

  const response = await handler(
    createRequest(
      "https://example.com/api/business/users/search?business_id=3&q=qa&limit=999",
    ),
  );

  assert.equal(response.status, 200);
  assert.equal(capturedLimit, 10);
});

test("business user search returns sanitized 500 on unexpected errors", async () => {
  const handler = createBusinessUsersSearchHandler(
    createJsonResponse,
    createDependencies({
      query: async () => {
        throw new Error("SELECT * FROM users password_hash SQL syntax error");
      },
    }),
  );

  const response = await handler(createRequest());
  const body = await response.json();

  assert.equal(response.status, 500);
  assert.deepEqual(body, {
    success: false,
    error: "No se pudieron buscar los usuarios.",
    users: [],
  });
  assertNoForbiddenKeys(body);
});
