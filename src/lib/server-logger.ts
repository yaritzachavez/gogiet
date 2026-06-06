import type { NextRequest } from "next/server";

import { sanitizeLogObject } from "./log-sanitizer.ts";
import { resolveRequestId } from "./request-id.ts";

type LogLevel = "debug" | "info" | "warn" | "error";
type SecuritySeverity = "low" | "medium" | "high" | "critical";
type LogMeta = Record<string, unknown>;

const LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

const RESERVED_LOG_KEYS = new Set([
  "level",
  "event",
  "message",
  "timestamp",
  "requestid",
  "endpoint",
  "method",
  "code",
  "statuscode",
  "errortype",
  "context",
]);

function resolveEnvironment() {
  const appEnv = String(process.env.APP_ENV ?? "")
    .trim()
    .toLowerCase();
  const vercelEnv = String(process.env.VERCEL_ENV ?? "")
    .trim()
    .toLowerCase();
  const nodeEnv = String(process.env.NODE_ENV ?? "")
    .trim()
    .toLowerCase();

  if (appEnv === "development" || nodeEnv === "development") {
    return "development" as const;
  }

  if (appEnv === "test" || nodeEnv === "test" || vercelEnv === "preview") {
    return "preview" as const;
  }

  return "production" as const;
}

function getMinimumLevel(environment: ReturnType<typeof resolveEnvironment>) {
  if (environment === "development") return "debug";
  if (environment === "preview") return "info";
  return "warn";
}

function shouldLog(level: LogLevel) {
  const environment = resolveEnvironment();
  const minimumLevel = getMinimumLevel(environment);
  return LEVEL_PRIORITY[level] >= LEVEL_PRIORITY[minimumLevel];
}

function normalizeReservedKey(key: string) {
  return key
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function buildSanitizedContext(meta?: LogMeta) {
  if (!meta) {
    return {};
  }

  const sanitized = sanitizeLogObject(meta, {
    includeErrorStack: resolveEnvironment() === "development",
  });
  const next: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(sanitized)) {
    if (RESERVED_LOG_KEYS.has(normalizeReservedKey(key))) {
      continue;
    }

    next[key] = value;
  }

  return next;
}

function getRequestPath(request?: NextRequest | Request | null) {
  if (!request?.url) {
    return null;
  }

  try {
    return new URL(request.url).pathname;
  } catch {
    return null;
  }
}

function writeLog(level: LogLevel, entry: Record<string, unknown>) {
  const serialized = JSON.stringify(entry);

  if (level === "error") {
    console.error(serialized);
    return;
  }

  if (level === "warn") {
    console.warn(serialized);
    return;
  }

  if (level === "info") {
    console.info(serialized);
    return;
  }

  console.debug(serialized);
}

export function buildServerLogEntry(
  level: LogLevel,
  event: string,
  message: string,
  meta?: LogMeta,
) {
  const sanitizedContext = buildSanitizedContext(meta);
  const requestId = resolveRequestId(
    null,
    typeof meta?.requestId === "string" ? meta.requestId : null,
  );

  return {
    level,
    event,
    message,
    timestamp: new Date().toISOString(),
    requestId,
    endpoint:
      typeof meta?.endpoint === "string"
        ? meta.endpoint
        : typeof meta?.route === "string"
          ? meta.route
          : null,
    method: typeof meta?.method === "string" ? meta.method : null,
    code: typeof meta?.code === "string" ? meta.code : null,
    statusCode: typeof meta?.statusCode === "number" ? meta.statusCode : null,
    errorType: typeof meta?.errorType === "string" ? meta.errorType : null,
    ...(Object.keys(sanitizedContext).length > 0
      ? { context: sanitizedContext }
      : {}),
  };
}

function emit(level: LogLevel, event: string, message: string, meta?: LogMeta) {
  if (!shouldLog(level)) {
    return;
  }

  writeLog(level, buildServerLogEntry(level, event, message, meta));
}

export function getRequestId(request?: NextRequest | Request | null) {
  return request ? resolveRequestId(request.headers) : resolveRequestId();
}

export function getRequestLoggerContext(
  request?: NextRequest | Request | null,
) {
  return {
    requestId: getRequestId(request),
    endpoint: getRequestPath(request),
    route: getRequestPath(request),
    method: request?.method ?? null,
  };
}

export const logger = {
  debug(event: string, message: string, meta?: LogMeta) {
    emit("debug", event, message, meta);
  },
  info(event: string, message: string, meta?: LogMeta) {
    emit("info", event, message, meta);
  },
  warn(event: string, message: string, meta?: LogMeta) {
    emit("warn", event, message, meta);
  },
  error(event: string, message: string, meta?: LogMeta) {
    emit("error", event, message, meta);
  },
  security(
    event: string,
    message: string,
    meta?: LogMeta & { severity?: SecuritySeverity },
  ) {
    const severity = meta?.severity ?? "medium";
    emit(
      severity === "critical" || severity === "high" ? "error" : "warn",
      event,
      message,
      {
        security: true,
        severity,
        ...meta,
      },
    );
  },
};
