import { NextResponse } from "next/server";

import { getFriendlyDatabaseErrorMessage } from "@/lib/db";

type ErrorContext = Record<string, unknown>;

function getErrorCode(error: unknown) {
  return error && typeof error === "object" && "code" in error
    ? (error as { code?: unknown }).code
    : undefined;
}

export function getSafeErrorMessage(error: unknown, fallback: string) {
  const friendlyDatabaseMessage = getFriendlyDatabaseErrorMessage(error);

  if (
    friendlyDatabaseMessage !== "No pudimos cargar los datos, intenta de nuevo."
  ) {
    return friendlyDatabaseMessage;
  }

  if (process.env.NODE_ENV !== "production" && error instanceof Error) {
    return error.message || fallback;
  }

  return fallback;
}

export function logServerError(
  event: string,
  error: unknown,
  context?: ErrorContext,
) {
  console.error(`[${event}]`, {
    ...context,
    message: error instanceof Error ? error.message : String(error),
    code: getErrorCode(error),
    stack: error instanceof Error ? error.stack : undefined,
  });
}

export function getSafeErrorPayload(
  error: unknown,
  fallback: string,
  extra?: ErrorContext,
) {
  const message = getSafeErrorMessage(error, fallback);

  return {
    ok: false,
    success: false,
    status: "error",
    message,
    error: message,
    ...extra,
  };
}

export function safeErrorResponse(
  event: string,
  error: unknown,
  fallback: string,
  status = 500,
  extra?: ErrorContext,
) {
  logServerError(event, error, extra);

  return NextResponse.json(getSafeErrorPayload(error, fallback, extra), {
    status,
  });
}
