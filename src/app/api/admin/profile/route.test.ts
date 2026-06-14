import assert from "node:assert/strict";
import test from "node:test";

import { createAdminProfileHandlers } from "./handler.ts";

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
    url: "https://example.com/api/admin/profile",
    headers: {
      get(name: string) {
        return name.toLowerCase() === "x-request-id"
          ? "req-admin-profile"
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

function createDependencies(
  overrides: Partial<Parameters<typeof createAdminProfileHandlers>[1]> = {},
) {
  return {
    getAuthUser: () => ({ id: 7 }),
    isAdminGeneral: async () => true,
    query: async () => {
      throw new Error("query mock not configured");
    },
    getRequestId: () => "req-admin-profile",
    logServerError: () => "req-admin-profile",
    ...overrides,
  };
}

test("admin/profile GET returns sanitized 401 without session", async () => {
  const handlers = createAdminProfileHandlers(
    createJsonResponse,
    createDependencies({
      getAuthUser: () => null,
    }),
  );

  const response = await handlers.GET(createRequest() as never);
  const body = (await response.json()) as { error: string };

  assert.equal(response.status, 401);
  assert.deepEqual(body, { error: "No autorizado" });
  assertNoForbiddenPayload(body);
});

test("admin/profile GET returns sanitized 403 without admin permission", async () => {
  const handlers = createAdminProfileHandlers(
    createJsonResponse,
    createDependencies({
      isAdminGeneral: async () => false,
    }),
  );

  const response = await handlers.GET(createRequest() as never);
  const body = (await response.json()) as { error: string };

  assert.equal(response.status, 403);
  assert.deepEqual(body, {
    error: "No tienes permisos para realizar esta acción",
  });
  assertNoForbiddenPayload(body);
});

test("admin/profile GET returns sanitized 404 when profile does not exist", async () => {
  const handlers = createAdminProfileHandlers(
    createJsonResponse,
    createDependencies({
      query: async () => [[]],
    }),
  );

  const response = await handlers.GET(createRequest() as never);
  const body = (await response.json()) as { error: string };

  assert.equal(response.status, 404);
  assert.deepEqual(body, { error: "Perfil no encontrado" });
  assertNoForbiddenPayload(body);
});

test("admin/profile GET returns sanitized 500 on unexpected errors", async () => {
  const handlers = createAdminProfileHandlers(
    createJsonResponse,
    createDependencies({
      query: async () => {
        throw new Error(
          "Unknown column users.password_hash mysql Table gogi_prod.orders doesn't exist",
        );
      },
    }),
  );

  const response = await handlers.GET(createRequest() as never);
  const body = (await response.json()) as { error: string };

  assert.equal(response.status, 500);
  assert.deepEqual(body, {
    error: "No fue posible obtener la información del perfil",
  });
  assertNoForbiddenPayload(body);
});

test("admin/profile GET preserves successful payload", async () => {
  const handlers = createAdminProfileHandlers(
    createJsonResponse,
    createDependencies({
      query: async () => [
        [
          {
            id: 7,
            first_name: "Ada",
            last_name: "Lovelace",
            email: "ada@gogieats.test",
            profile_image_url: "/ada.jpg",
          },
        ],
      ],
    }),
  );

  const response = await handlers.GET(createRequest() as never);
  const body = (await response.json()) as {
    success: boolean;
    profile: {
      id: number;
      name: string;
      email: string;
      imageUrl: string | null;
    };
  };

  assert.equal(response.status, 200);
  assert.equal(body.success, true);
  assert.deepEqual(body.profile, {
    id: 7,
    name: "Ada Lovelace",
    email: "ada@gogieats.test",
    imageUrl: "/ada.jpg",
  });
});

test("admin/profile PATCH returns sanitized validation errors", async () => {
  const handlers = createAdminProfileHandlers(
    createJsonResponse,
    createDependencies(),
  );

  const invalidEmailResponse = await handlers.PATCH(
    createRequest({ name: "Ada", email: "bad-email" }) as never,
  );
  const invalidEmailBody = (await invalidEmailResponse.json()) as {
    error: string;
  };

  assert.equal(invalidEmailResponse.status, 400);
  assert.deepEqual(invalidEmailBody, { error: "El correo no es válido" });
  assertNoForbiddenPayload(invalidEmailBody);
});

test("admin/profile PATCH returns sanitized 500 on unexpected errors", async () => {
  const handlers = createAdminProfileHandlers(
    createJsonResponse,
    createDependencies({
      query: async () => {
        throw new Error(
          "Access token rejected SQL syntax error MercadoPagoConfig",
        );
      },
    }),
  );

  const response = await handlers.PATCH(
    createRequest({
      name: "Ada Lovelace",
      email: "ada@gogieats.test",
    }) as never,
  );
  const body = (await response.json()) as { error: string };

  assert.equal(response.status, 500);
  assert.deepEqual(body, {
    error: "No fue posible obtener la información del perfil",
  });
  assertNoForbiddenPayload(body);
});

test("admin/profile PATCH preserves successful payload", async () => {
  const handlers = createAdminProfileHandlers(
    createJsonResponse,
    createDependencies({
      query: async () => [[]],
    }),
  );

  const response = await handlers.PATCH(
    createRequest({
      name: "Ada Lovelace",
      email: "ada@gogieats.test",
    }) as never,
  );
  const body = (await response.json()) as {
    success: boolean;
    message: string;
    profile: {
      id: number;
      name: string;
      email: string;
      imageUrl: string | null;
    };
  };

  assert.equal(response.status, 200);
  assert.equal(body.success, true);
  assert.equal(body.message, "Perfil actualizado");
  assert.deepEqual(body.profile, {
    id: 7,
    name: "Ada Lovelace",
    email: "ada@gogieats.test",
    imageUrl: null,
  });
});
