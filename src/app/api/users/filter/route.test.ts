import assert from "node:assert/strict";
import test from "node:test";

import { createUsersFilterHandler } from "./handler.ts";

function createJsonResponse(body: unknown, init: { status: number }) {
  return {
    status: init.status,
    async json() {
      return body;
    },
  };
}

test("users/filter is disabled for public requests", async () => {
  const handler = createUsersFilterHandler(createJsonResponse);
  const response = await handler();
  const body = await response.json();

  assert.equal(response.status, 404);
  assert.deepEqual(body, {
    success: false,
    error: "Recurso no disponible.",
  });
});

test("users/filter never returns user lists or PII", async () => {
  const handler = createUsersFilterHandler(createJsonResponse);
  const response = await handler();
  const body = (await response.json()) as Record<string, unknown>;

  assert.equal(response.status, 404);
  assert.equal("users" in body, false);
  assert.equal(JSON.stringify(body).includes("@"), false);
});
