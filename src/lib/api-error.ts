import { NextResponse } from "next/server";

import {
  type ApiErrorCode,
  buildApiErrorPayload,
  classifyUnexpectedError,
  emitApiErrorLog,
  getRequestId,
  getSafeErrorMessage,
  getStatusForErrorCode,
  type RequestLike,
  sanitizeLegacyErrorBody,
} from "./api-error-logic";
import { logger } from "./logger";

type ErrorContext = Record<string, unknown>;
type ValidationFields = Record<string, string>;

export {
  type ApiErrorCode,
  buildApiErrorLogMeta,
  buildApiErrorPayload,
  classifyUnexpectedError,
  emitApiErrorLog,
  getPublicMessageForErrorCode,
  getRequestId,
  getSafeErrorMessage,
  getStatusForErrorCode,
  type RequestLike,
} from "./api-error-logic";

export function apiErrorResponse(
  request: RequestLike,
  params: {
    code: ApiErrorCode;
    message?: string;
    fields?: ValidationFields;
    extra?: ErrorContext;
    requestId?: string | null;
  },
) {
  const requestId = getRequestId(request, params.requestId ?? null);
  const payload = buildApiErrorPayload({
    code: params.code,
    message: params.message,
    requestId,
    fields: params.fields,
    extra: params.extra,
  });

  return NextResponse.json(payload, {
    status: getStatusForErrorCode(params.code),
    headers: {
      "x-request-id": requestId,
    },
  });
}

export function logServerError(
  event: string,
  error: unknown,
  context?: ErrorContext & {
    requestId?: string | null;
    request?: RequestLike;
    code?: ApiErrorCode;
  },
) {
  return emitApiErrorLog(logger.error, event, error, context).requestId;
}

export function validationErrorResponse(
  request: RequestLike,
  fields: ValidationFields,
  extra?: ErrorContext,
  message = "Revisa los datos enviados",
) {
  return apiErrorResponse(request, {
    code: "VALIDATION_ERROR",
    message,
    fields,
    extra,
  });
}

export function safeErrorResponse(
  event: string,
  error: unknown,
  fallback: string,
  status = 500,
  extra?: ErrorContext & {
    request?: RequestLike;
  },
) {
  const { request, ...publicExtra } = extra ?? {};
  const classified =
    status >= 500
      ? classifyUnexpectedError(error)
      : {
          code: "INTERNAL_ERROR" as const,
          message: getSafeErrorMessage(error, fallback),
        };
  const requestId = logServerError(event, error, {
    ...publicExtra,
    request,
    code: classified.code,
  });

  const responseStatus =
    status >= 500 ? getStatusForErrorCode(classified.code) : status;

  return NextResponse.json(
    buildApiErrorPayload({
      code: status >= 500 ? classified.code : "INTERNAL_ERROR",
      message:
        status >= 500
          ? classified.message
          : getSafeErrorMessage(error, fallback),
      requestId,
      extra: publicExtra,
    }),
    {
      status: responseStatus,
      headers: {
        "x-request-id": requestId,
      },
    },
  );
}

export function legacyErrorResponse(
  request: RequestLike,
  params: {
    event: string;
    error: unknown;
    message: string;
    status?: number;
    body?: ErrorContext;
    requestId?: string | null;
  },
) {
  const requestId = logServerError(params.event, params.error, {
    request,
    ...(params.body ?? {}),
  });
  const sanitizedBody = sanitizeLegacyErrorBody(params.body) ?? {};

  return NextResponse.json(
    {
      ...sanitizedBody,
      error: params.message,
    },
    {
      status: params.status ?? 500,
      headers: {
        "x-request-id": getRequestId(request, params.requestId ?? requestId),
      },
    },
  );
}
