import { sanitizeLogValue } from "./log-sanitizer.ts";
import { resolveRequestId } from "./request-id.ts";

type ErrorContext = Record<string, unknown>;
type ValidationFields = Record<string, string>;

export type ApiErrorCode =
  | "VALIDATION_ERROR"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "METHOD_NOT_ALLOWED"
  | "CONFLICT"
  | "UNPROCESSABLE_ENTITY"
  | "RATE_LIMITED"
  | "INTERNAL_ERROR"
  | "SERVICE_UNAVAILABLE";

export type RequestLike =
  | Request
  | { headers?: Pick<Headers, "get">; method?: string; url?: string }
  | null
  | undefined;

const BLOCKED_PUBLIC_ERROR_KEYS = new Set([
  "debug",
  "details",
  "stack",
  "query",
  "queryused",
  "sql",
  "sqlmessage",
  "columns",
  "availablebusinesscolumns",
  "businessownersquery",
  "businessownersresult",
  "ownerbusinessesquery",
  "ownerbusinessesresult",
  "repairsources",
  "businessquery",
  "businessresult",
  "request",
]);

const STATUS_BY_CODE: Record<ApiErrorCode, number> = {
  VALIDATION_ERROR: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  METHOD_NOT_ALLOWED: 405,
  CONFLICT: 409,
  UNPROCESSABLE_ENTITY: 422,
  RATE_LIMITED: 429,
  INTERNAL_ERROR: 500,
  SERVICE_UNAVAILABLE: 503,
};

function getErrorCode(error: unknown) {
  return error && typeof error === "object" && "code" in error
    ? String((error as { code?: unknown }).code ?? "")
    : "";
}

function getErrorName(error: unknown) {
  return error instanceof Error
    ? error.name
    : error && typeof error === "object" && "name" in error
      ? String((error as { name?: unknown }).name ?? "")
      : "UnknownError";
}

function getErrorMessageText(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function getRequestPath(request?: RequestLike) {
  if (!request?.url) {
    return null;
  }

  try {
    return new URL(request.url).pathname;
  } catch {
    return null;
  }
}

function isTooManyConnectionsError(error: unknown) {
  const errorLike = error as {
    code?: unknown;
    errno?: unknown;
    message?: unknown;
  };
  const code = String(errorLike?.code ?? "").toUpperCase();
  const message = String(errorLike?.message ?? "").toLowerCase();

  return (
    code === "ER_CON_COUNT_ERROR" ||
    Number(errorLike?.errno) === 1040 ||
    message.includes("too many connections")
  );
}

function getFriendlyDatabaseErrorMessage(error: unknown) {
  const errorLike = error as {
    code?: unknown;
    message?: unknown;
    name?: unknown;
  };
  const code = String(errorLike?.code ?? "").toUpperCase();
  const message = String(errorLike?.message ?? "").toLowerCase();
  const name = String(errorLike?.name ?? "").toLowerCase();

  if (
    code === "ENOTFOUND" ||
    message.includes("getaddrinfo enotfound") ||
    name.includes("prismaclientinitializationerror")
  ) {
    return "No pudimos conectar con la base de datos. Intenta de nuevo en unos segundos.";
  }

  if (isTooManyConnectionsError(error)) {
    return "No pudimos cargar los datos en este momento. Intenta de nuevo en unos segundos.";
  }

  return "No pudimos cargar los datos, intenta de nuevo.";
}

function sanitizePublicErrorExtra(
  extra?: ErrorContext,
): ErrorContext | undefined {
  if (!extra) {
    return undefined;
  }

  const sanitized = Object.entries(extra).reduce<ErrorContext>(
    (acc, [key, value]) => {
      const normalizedKey = key
        .trim()
        .toLowerCase()
        .replace(/[_\s-]/g, "");
      if (BLOCKED_PUBLIC_ERROR_KEYS.has(normalizedKey)) {
        return acc;
      }

      if (Array.isArray(value)) {
        acc[key] = value.map((entry) =>
          typeof entry === "object" && entry !== null
            ? (sanitizePublicErrorExtra(entry as ErrorContext) ?? {})
            : entry,
        );
        return acc;
      }

      if (value && typeof value === "object") {
        acc[key] = sanitizePublicErrorExtra(value as ErrorContext) ?? {};
        return acc;
      }

      acc[key] = value;
      return acc;
    },
    {},
  );

  return Object.keys(sanitized).length ? sanitized : undefined;
}

export function sanitizeLegacyErrorBody(
  body?: ErrorContext,
): ErrorContext | undefined {
  return sanitizePublicErrorExtra(body);
}

export function getRequestId(
  request?: RequestLike,
  fallbackRequestId?: string | null,
) {
  return resolveRequestId(request?.headers, fallbackRequestId);
}

export function getStatusForErrorCode(code: ApiErrorCode) {
  return STATUS_BY_CODE[code];
}

export function getPublicMessageForErrorCode(code: ApiErrorCode) {
  switch (code) {
    case "VALIDATION_ERROR":
      return "Revisa los datos enviados";
    case "UNAUTHORIZED":
      return "No autorizado";
    case "FORBIDDEN":
      return "Acceso denegado";
    case "NOT_FOUND":
      return "Recurso no encontrado";
    case "METHOD_NOT_ALLOWED":
      return "Método no permitido";
    case "CONFLICT":
      return "La operación no se pudo completar por un conflicto";
    case "UNPROCESSABLE_ENTITY":
      return "No se pudo procesar la solicitud";
    case "RATE_LIMITED":
      return "Demasiadas solicitudes. Intenta de nuevo más tarde";
    case "SERVICE_UNAVAILABLE":
      return "Servicio temporalmente no disponible";
    default:
      return "Ocurrió un error inesperado";
  }
}

export function classifyUnexpectedError(error: unknown): {
  code: "INTERNAL_ERROR" | "SERVICE_UNAVAILABLE";
  message: string;
} {
  const code = getErrorCode(error).toUpperCase();
  const name = getErrorName(error).toLowerCase();
  const friendlyDatabaseMessage = getFriendlyDatabaseErrorMessage(error);

  if (
    name.includes("runtimeschemaerror") ||
    isTooManyConnectionsError(error) ||
    code === "ENOTFOUND" ||
    code === "ECONNREFUSED" ||
    name.includes("prismaclientinitializationerror")
  ) {
    return {
      code: "SERVICE_UNAVAILABLE",
      message: getPublicMessageForErrorCode("SERVICE_UNAVAILABLE"),
    };
  }

  if (
    friendlyDatabaseMessage !== "No pudimos cargar los datos, intenta de nuevo."
  ) {
    return {
      code: "INTERNAL_ERROR",
      message: getPublicMessageForErrorCode("INTERNAL_ERROR"),
    };
  }

  return {
    code: "INTERNAL_ERROR",
    message: getPublicMessageForErrorCode("INTERNAL_ERROR"),
  };
}

export function getSafeErrorMessage(error: unknown, fallback: string) {
  const friendlyDatabaseMessage = getFriendlyDatabaseErrorMessage(error);

  if (
    friendlyDatabaseMessage !== "No pudimos cargar los datos, intenta de nuevo."
  ) {
    return friendlyDatabaseMessage;
  }

  return fallback;
}

export function buildApiErrorPayload(params: {
  code: ApiErrorCode;
  requestId: string;
  message?: string;
  fields?: ValidationFields;
  extra?: ErrorContext;
}) {
  const sanitizedExtra = sanitizePublicErrorExtra(params.extra);

  return {
    success: false,
    error: {
      code: params.code,
      message: params.message ?? getPublicMessageForErrorCode(params.code),
      requestId: params.requestId,
      ...(params.fields ? { fields: params.fields } : {}),
    },
    ...(sanitizedExtra ?? {}),
  };
}

export function buildApiErrorLogMeta(params: {
  requestId: string;
  request?: RequestLike;
  code: ApiErrorCode;
  error: unknown;
  context?: ErrorContext;
}) {
  return {
    requestId: params.requestId,
    endpoint: getRequestPath(params.request),
    method: params.request?.method ?? null,
    code: params.code,
    statusCode: getStatusForErrorCode(params.code),
    errorType: getErrorName(params.error),
    message: sanitizeLogValue(getErrorMessageText(params.error)),
    ...params.context,
  };
}

export function emitApiErrorLog(
  logFn: (event: string, message: string, meta?: ErrorContext) => void,
  event: string,
  error: unknown,
  context?: ErrorContext & {
    requestId?: string | null;
    request?: RequestLike;
    code?: ApiErrorCode;
  },
) {
  const requestId = getRequestId(context?.request, context?.requestId ?? null);
  const code = context?.code ?? classifyUnexpectedError(error).code;
  const meta = buildApiErrorLogMeta({
    requestId,
    request: context?.request,
    code,
    error,
    context,
  });

  logFn(event, "Server error", meta);
  return { requestId, meta };
}
