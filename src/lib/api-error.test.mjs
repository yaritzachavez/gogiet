import assert from "node:assert/strict";
import test from "node:test";

import {
  buildApiErrorLogMeta,
  buildApiErrorPayload,
  classifyUnexpectedError,
  emitApiErrorLog,
  getRequestId,
} from "./api-error-logic.ts";

test("401 payload does not contain stack or debug and includes requestId", () => {
  const payload = buildApiErrorPayload({
    code: "UNAUTHORIZED",
    requestId: "req-test-401",
  });

  assert.equal(payload.success, false);
  assert.equal(payload.error.code, "UNAUTHORIZED");
  assert.equal(payload.error.requestId, "req-test-401");
  assert.equal("stack" in payload.error, false);
  assert.equal("debug" in payload, false);
});

test("403 payload does not contain query or column details", async () => {
  const payload = buildApiErrorPayload({
    code: "FORBIDDEN",
    requestId: "req-test-403",
    extra: {
      query: "SELECT * FROM business",
      sql: "unknown column owner_id",
      columns: ["owner_id"],
      business: null,
    },
  });
  assert.equal(payload.error.code, "FORBIDDEN");
  assert.equal(payload.error.requestId, "req-test-403");
  assert.equal("query" in payload, false);
  assert.equal("sql" in payload, false);
  assert.deepEqual(payload.business, null);
});

test("Prisma errors are normalized to INTERNAL_ERROR", () => {
  const prismaError = {
    name: "PrismaClientKnownRequestError",
    code: "P2022",
    message: "Column owner_id does not exist",
  };

  const normalized = classifyUnexpectedError(prismaError);
  assert.deepEqual(normalized, {
    code: "INTERNAL_ERROR",
    message: "Ocurrió un error inesperado",
  });
});

test("MySQL errors do not reveal host, table or column names", () => {
  const mysqlError = {
    code: "ER_BAD_FIELD_ERROR",
    message:
      "Unknown column 'p.image_url' in 'field list' on gogi-eats-db-gogieats2305-e669.k.aivencloud.com",
  };

  const normalized = classifyUnexpectedError(mysqlError);
  assert.equal(normalized.code, "INTERNAL_ERROR");
  assert.equal(normalized.message.includes("image_url"), false);
  assert.equal(normalized.message.includes("aivencloud"), false);
});

test("unknown errors return a generic internal message", () => {
  const normalized = classifyUnexpectedError(new Error("unexpected boom"));
  assert.deepEqual(normalized, {
    code: "INTERNAL_ERROR",
    message: "Ocurrió un error inesperado",
  });
});

test("VALIDATION_ERROR preserves safe fields", async () => {
  const payload = buildApiErrorPayload({
    code: "VALIDATION_ERROR",
    requestId: "req-validation-1",
    fields: {
      email: "Correo inválido",
    },
  });
  assert.deepEqual(payload.error.fields, {
    email: "Correo inválido",
  });
  assert.equal(payload.error.requestId, "req-validation-1");
});

test("requestId reuses a valid incoming id and log meta keeps the same id", () => {
  const request = {
    headers: {
      get: (name) => (name === "x-request-id" ? "req-shared-123" : null),
    },
    method: "PATCH",
    url: "https://example.com/api/admin/orders",
  };

  const requestId = getRequestId(request);
  const meta = buildApiErrorLogMeta({
    requestId,
    request,
    code: "INTERNAL_ERROR",
    error: new Error("raw db failure"),
  });

  assert.equal(requestId, "req-shared-123");
  assert.equal(meta.requestId, "req-shared-123");
  assert.equal(meta.endpoint, "/api/admin/orders");
});

test("logger receives the same requestId in the structured log meta", () => {
  const writes = [];
  const request = {
    headers: {
      get: (name) => (name === "x-request-id" ? "req-log-500" : null),
    },
    method: "GET",
    url: "https://example.com/api/delivery/orders",
  };

  const { requestId, meta } = emitApiErrorLog(
    (event, message, payload) => {
      writes.push({ event, message, payload });
    },
    "test.api_error",
    new Error("db host leaked"),
    {
      request,
      code: "INTERNAL_ERROR",
    },
  );

  assert.equal(requestId, "req-log-500");
  assert.equal(writes.length, 1);
  assert.equal(meta.requestId, "req-log-500");
  assert.equal(writes[0].payload.requestId, "req-log-500");
  assert.equal(writes[0].payload.code, "INTERNAL_ERROR");
});

test("internal error responses never return raw error.message", async () => {
  const payload = buildApiErrorPayload({
    code: "INTERNAL_ERROR",
    requestId: "req-500-raw",
  });
  assert.equal(payload.error.message, "Ocurrió un error inesperado");
  assert.equal(payload.error.message.includes("raw"), false);
});
