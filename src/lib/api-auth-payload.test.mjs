import assert from "node:assert/strict";
import test from "node:test";

import { buildAuthorizationErrorPayload } from "./api-auth-payload.ts";

test("buildAuthorizationErrorPayload returns structured unauthorized payload", () => {
  const payload = buildAuthorizationErrorPayload({
    code: "UNAUTHORIZED",
    message: "No autorizado",
  });

  assert.deepEqual(payload, {
    success: false,
    error: {
      code: "UNAUTHORIZED",
      message: "No autorizado",
    },
  });
});

test("buildAuthorizationErrorPayload strips debug internals from extra fields", () => {
  const payload = buildAuthorizationErrorPayload({
    code: "FORBIDDEN",
    message: "Acceso denegado",
    extra: {
      business: null,
      orders: [],
      details: "raw details",
      debug: { stack: "secret stack", query: "SELECT * FROM users" },
      availableBusinessColumns: ["owner_id"],
    },
  });

  assert.deepEqual(payload, {
    success: false,
    error: {
      code: "FORBIDDEN",
      message: "Acceso denegado",
    },
    business: null,
    orders: [],
  });
});
