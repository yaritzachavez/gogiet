import assert from "node:assert/strict";
import test from "node:test";

import {
  maskEmail,
  maskPhone,
  sanitizeLogObject,
  sanitizeLogValue,
} from "./log-sanitizer.ts";

test("redacts tokens", () => {
  const result = sanitizeLogObject({
    accessToken: "abc123",
    refresh_token: "refresh123",
  });

  assert.equal(result.accessToken, "[REDACTED]");
  assert.equal(result.refresh_token, "[REDACTED]");
});

test("redacts passwords", () => {
  const result = sanitizeLogObject({
    password: "super-secret",
    passwd: "super-secret-2",
  });

  assert.equal(result.password, "[REDACTED]");
  assert.equal(result.passwd, "[REDACTED]");
});

test("redacts authorization", () => {
  const result = sanitizeLogObject({
    authorization: "Bearer secret.jwt.token",
  });

  assert.equal(result.authorization, "[REDACTED]");
});

test("redacts cookies", () => {
  const result = sanitizeLogObject({
    cookie: "authToken=abc",
    "set-cookie": "authToken=abc",
  });

  assert.equal(result.cookie, "[REDACTED]");
  assert.equal(result["set-cookie"], "[REDACTED]");
});

test("redacts database url", () => {
  const result = sanitizeLogObject({
    DATABASE_URL: "mysql://user:pass@cluster.aivencloud.com:1234/gogi_prod",
  });

  assert.equal(result.DATABASE_URL, "[REDACTED]");
});

test("redacts cvv and card number", () => {
  const result = sanitizeLogObject({
    cvv: "123",
    cardNumber: "4111111111111111",
  });

  assert.equal(result.cvv, "[REDACTED]");
  assert.equal(result.cardNumber, "[REDACTED]");
});

test("sanitizes nested objects", () => {
  const result = sanitizeLogObject({
    payment: {
      token: "tok_123",
      payer: {
        email: "usuario@example.com",
      },
    },
  });

  assert.equal(result.payment.token, "[REDACTED]");
  assert.equal(result.payment.payer.email, "us***@example.com");
});

test("sanitizes arrays", () => {
  const result = sanitizeLogObject({
    entries: [{ token: "tok_1" }, { authorization: "Bearer abc" }],
  });

  assert.equal(result.entries[0].token, "[REDACTED]");
  assert.equal(result.entries[1].authorization, "[REDACTED]");
});

test("does not mutate original object", () => {
  const input = {
    token: "tok_123",
    nested: {
      email: "usuario@example.com",
    },
  };

  const clone = structuredClone(input);
  sanitizeLogObject(input);

  assert.deepEqual(input, clone);
});

test("masks emails correctly", () => {
  assert.equal(maskEmail("usuario@example.com"), "us***@example.com");
});

test("masks phones correctly", () => {
  assert.equal(maskPhone("3312345678"), "******5678");
});

test("preserves requestId and orderId", () => {
  const result = sanitizeLogObject({
    requestId: "req-test-123",
    orderId: 456,
  });

  assert.equal(result.requestId, "req-test-123");
  assert.equal(result.orderId, 456);
});

test("handles circular errors without throwing", () => {
  const circular = {};
  circular.self = circular;

  const result = sanitizeLogValue(circular);
  assert.equal(result.self, "[Circular]");
});

test("handles null undefined and primitives safely", () => {
  assert.equal(sanitizeLogValue(null), null);
  assert.equal(sanitizeLogValue(undefined), undefined);
  assert.equal(sanitizeLogValue(123), 123);
  assert.equal(sanitizeLogValue(true), true);
});

test("redacts sql queries and database messages", () => {
  const result = sanitizeLogObject({
    query: "SELECT * FROM users",
    message: "Unknown column 'p.image_url' in 'field list'",
  });

  assert.equal(result.query, "[REDACTED_SQL]");
  assert.equal(result.message, "Database operation failed");
});

test("redacts jwt-like strings even outside sensitive keys", () => {
  const result = sanitizeLogObject({
    message: "eyJhbGciOiJIUzI1NiJ9.eyJpZCI6MX0.signature",
  });

  assert.equal(result.message, "[REDACTED]");
});

test("truncates long strings", () => {
  const long = "a".repeat(600);
  const result = sanitizeLogObject({ message: long });

  assert.equal(String(result.message).endsWith("[TRUNCATED]"), true);
});
