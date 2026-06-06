import assert from "node:assert/strict";
import test from "node:test";

import {
  buildServerLogEntry,
  getRequestId,
  getRequestLoggerContext,
} from "./server-logger.ts";

test("buildServerLogEntry preserves requestId and sanitizes context", () => {
  const entry = buildServerLogEntry("error", "test.error", "Failure", {
    requestId: "req-test-logger",
    endpoint: "/api/test",
    method: "POST",
    code: "INTERNAL_ERROR",
    token: "tok_123",
    email: "usuario@example.com",
  });

  assert.equal(entry.requestId, "req-test-logger");
  assert.equal(entry.endpoint, "/api/test");
  assert.equal(entry.method, "POST");
  assert.equal(entry.code, "INTERNAL_ERROR");
  assert.equal(entry.context.token, "[REDACTED]");
  assert.equal(entry.context.email, "us***@example.com");
});

test("buildServerLogEntry does not let context overwrite reserved keys", () => {
  const entry = buildServerLogEntry("info", "test.info", "Hello", {
    requestId: "req-test-reserved",
    level: "hack",
    message: "hack",
    timestamp: "hack",
    endpoint: "/api/safe",
  });

  assert.equal(entry.level, "info");
  assert.equal(entry.message, "Hello");
  assert.equal(entry.endpoint, "/api/safe");
  assert.equal(entry.context?.level, undefined);
});

test("getRequestId reuses incoming request id when valid", () => {
  const request = {
    headers: {
      get(name) {
        return name === "x-request-id" ? "req-valid-12345" : null;
      },
    },
  };

  assert.equal(getRequestId(request), "req-valid-12345");
});

test("getRequestLoggerContext includes endpoint method and requestId", () => {
  const request = new Request("https://example.com/api/orders", {
    method: "PATCH",
    headers: {
      "x-request-id": "req-context-123",
    },
  });

  const context = getRequestLoggerContext(request);

  assert.equal(context.requestId, "req-context-123");
  assert.equal(context.endpoint, "/api/orders");
  assert.equal(context.method, "PATCH");
});

test("error objects are sanitized inside log context", () => {
  const entry = buildServerLogEntry("error", "test.error", "Boom", {
    requestId: "req-error-123",
    error: new Error("Unknown column 'secret' in 'field list'"),
  });

  assert.equal(entry.context.error.message, "Database operation failed");
});
