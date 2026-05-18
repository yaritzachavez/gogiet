import type { NextRequest } from "next/server";

type LogLevel = "debug" | "info" | "warn" | "error";
type SecuritySeverity = "low" | "medium" | "high" | "critical";

type LogMeta = Record<string, unknown>;

const LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

const REDACTED = "[REDACTED]";
const SENSITIVE_KEY_PATTERNS = [
  "authorization",
  "cookie",
  "set-cookie",
  "password",
  "password_hash",
  "token",
  "access_token",
  "refresh_token",
  "verification_code",
  "database_url",
  "db_password",
  "db_pass",
  "jwt_secret",
  "nextauth_secret",
  "session_secret",
  "admin_secret",
  "mercadopago_access_token",
  "mercadopago_webhook_secret",
  "resend_api_key",
  "clabe",
  "card",
  "bank",
];

const PARTIALLY_SENSITIVE_KEY_PATTERNS = ["email", "phone"];

function resolveEnvironment() {
  const vercelEnv = process.env.VERCEL_ENV?.trim().toLowerCase();
  const nodeEnv = process.env.NODE_ENV?.trim().toLowerCase();

  if (nodeEnv === "development") return "development";
  if (vercelEnv === "preview" || nodeEnv === "test") return "preview";
  return "production";
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

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeKey(key: string) {
  return key.trim().toLowerCase().replace(/[_\s]/g, "-");
}

function maskEmail(value: string) {
  const [local, domain] = value.split("@");
  if (!local || !domain) return REDACTED;
  const visible = local.slice(0, 2);
  return `${visible || "*"}***@${domain}`;
}

function maskPhone(value: string) {
  const digits = value.replace(/\D/g, "");
  if (digits.length < 4) return REDACTED;
  return `***${digits.slice(-4)}`;
}

function sanitizeString(value: string) {
  const trimmed = value.trim();
  const lower = trimmed.toLowerCase();

  if (
    lower.startsWith("bearer ") ||
    lower.startsWith("token ") ||
    lower.includes("password=") ||
    lower.includes("access_token") ||
    lower.includes("refresh_token") ||
    lower.includes("jwt_secret") ||
    lower.includes("mercadopago_access_token") ||
    lower.includes("mercadopago_webhook_secret") ||
    lower.includes("resend_api_key")
  ) {
    return REDACTED;
  }

  try {
    const parsed = new URL(trimmed);
    if (parsed.username || parsed.password) {
      const safeUsername = parsed.username
        ? `${parsed.username.slice(0, 2)}***`
        : "";
      return `${parsed.protocol}//${safeUsername}:***@${parsed.hostname}${
        parsed.port ? `:${parsed.port}` : ""
      }${parsed.pathname}${parsed.search}`;
    }
  } catch {}

  return trimmed;
}

function redactValue(key: string | null, value: unknown): unknown {
  if (value == null) {
    return value;
  }

  if (value instanceof Error) {
    return {
      name: value.name,
      message: sanitizeString(value.message),
      ...(resolveEnvironment() === "development" && value.stack
        ? { stack: sanitizeString(value.stack) }
        : {}),
    };
  }

  if (Array.isArray(value)) {
    return value.map((entry) => redactValue(key, entry));
  }

  if (typeof value === "string") {
    const normalizedKey = key ? normalizeKey(key) : "";

    if (
      SENSITIVE_KEY_PATTERNS.some((pattern) => normalizedKey.includes(pattern))
    ) {
      return REDACTED;
    }

    if (
      PARTIALLY_SENSITIVE_KEY_PATTERNS.some((pattern) =>
        normalizedKey.includes(pattern),
      )
    ) {
      if (normalizedKey.includes("email")) return maskEmail(value);
      if (normalizedKey.includes("phone")) return maskPhone(value);
    }

    return sanitizeString(value);
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return value;
  }

  if (isObject(value)) {
    const next: Record<string, unknown> = {};

    for (const [entryKey, entryValue] of Object.entries(value)) {
      const normalizedKey = normalizeKey(entryKey);

      if (
        SENSITIVE_KEY_PATTERNS.some((pattern) =>
          normalizedKey.includes(pattern),
        )
      ) {
        next[entryKey] = REDACTED;
        continue;
      }

      if (
        PARTIALLY_SENSITIVE_KEY_PATTERNS.some((pattern) =>
          normalizedKey.includes(pattern),
        )
      ) {
        if (typeof entryValue === "string") {
          next[entryKey] = normalizedKey.includes("email")
            ? maskEmail(entryValue)
            : maskPhone(entryValue);
          continue;
        }
      }

      next[entryKey] = redactValue(entryKey, entryValue);
    }

    return next;
  }

  return value;
}

function buildBaseLog(payload: {
  level: LogLevel;
  event: string;
  message: string;
  meta?: LogMeta;
}) {
  const environment = resolveEnvironment();

  return redactValue(null, {
    level: payload.level,
    event: payload.event,
    message: payload.message,
    environment,
    timestamp: new Date().toISOString(),
    ...payload.meta,
  });
}

function emit(level: LogLevel, event: string, message: string, meta?: LogMeta) {
  if (!shouldLog(level)) {
    return;
  }

  const entry = buildBaseLog({ level, event, message, meta });
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

export function getRequestId(request?: NextRequest | Request | null) {
  return (
    request?.headers.get("x-request-id")?.trim() ||
    request?.headers.get("x-correlation-id")?.trim() ||
    null
  );
}

export function getRequestLoggerContext(
  request?: NextRequest | Request | null,
) {
  return {
    requestId: getRequestId(request),
    route:
      request instanceof Request
        ? (() => {
            try {
              return new URL(request.url).pathname;
            } catch {
              return null;
            }
          })()
        : null,
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
