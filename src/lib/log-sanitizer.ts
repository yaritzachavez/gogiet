const REDACTED = "[REDACTED]";
const REDACTED_SQL = "[REDACTED_SQL]";
const REDACTED_CARD = "[REDACTED_CARD]";
const TRUNCATED = "[TRUNCATED]";
const CIRCULAR = "[Circular]";

const SENSITIVE_KEY_PATTERNS = [
  "password",
  "passwd",
  "secret",
  "token",
  "authorization",
  "cookie",
  "set-cookie",
  "databaseurl",
  "database_url",
  "dbpassword",
  "dbpass",
  "jwtsecret",
  "authsecret",
  "accesskey",
  "clientsecret",
  "securitycode",
  "cvv",
  "cardnumber",
  "cardtoken",
  "mercadopagoaccesstoken",
  "mercadopagowebhooksecret",
  "identificationnumber",
  "documentnumber",
  "taxid",
  "clabe",
];

const PARTIAL_MASK_KEY_PATTERNS = ["email", "phone"];

const PRESERVED_IDENTIFIER_KEYS = new Set([
  "requestid",
  "orderid",
  "paymentid",
  "businessid",
  "endpoint",
  "statuscode",
  "method",
  "code",
]);

type SanitizerOptions = {
  maxDepth?: number;
  maxArrayLength?: number;
  maxObjectKeys?: number;
  maxStringLength?: number;
  includeErrorStack?: boolean;
};

type ErrorLike = {
  name?: unknown;
  message?: unknown;
  stack?: unknown;
  cause?: unknown;
};

const DEFAULT_OPTIONS: Required<SanitizerOptions> = {
  maxDepth: 5,
  maxArrayLength: 25,
  maxObjectKeys: 50,
  maxStringLength: 500,
  includeErrorStack: false,
};

function normalizeKey(key: string) {
  return key
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    !(value instanceof Date) &&
    !(value instanceof Error) &&
    !(value instanceof URL)
  );
}

function looksLikeEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

function looksLikeJwt(value: string) {
  return /^[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+$/.test(value.trim());
}

function looksLikeSql(value: string) {
  return /^(select|insert|update|delete|replace|alter|drop|create|truncate|describe|show|with)\b/i.test(
    value.trim(),
  );
}

function looksLikePem(value: string) {
  return value.includes("-----BEGIN") || value.includes("-----END");
}

function sanitizeUrlString(value: string) {
  try {
    const parsed = new URL(value);
    if (
      parsed.username ||
      parsed.password ||
      /aivencloud\.com/i.test(parsed.hostname) ||
      /mysql/i.test(parsed.protocol)
    ) {
      return REDACTED;
    }
  } catch {}

  return null;
}

function sanitizePotentialSecretString(value: string) {
  const trimmed = value.trim();
  const lower = trimmed.toLowerCase();

  if (!trimmed) {
    return trimmed;
  }

  if (looksLikePem(trimmed)) {
    return REDACTED;
  }

  if (
    lower.startsWith("bearer ") ||
    lower.startsWith("basic ") ||
    lower.includes("access_token") ||
    lower.includes("refresh_token") ||
    lower.includes("authorization:") ||
    lower.includes("cookie:") ||
    lower.includes("set-cookie:") ||
    lower.includes("database_url") ||
    lower.includes("mercadopago_access_token") ||
    lower.includes("jwt_secret") ||
    lower.includes("auth_secret")
  ) {
    return REDACTED;
  }

  if (lower.includes("aivencloud.com") || lower.includes(".mysql.database.")) {
    return REDACTED;
  }

  if (looksLikeJwt(trimmed)) {
    return REDACTED;
  }

  const sanitizedUrl = sanitizeUrlString(trimmed);
  if (sanitizedUrl) {
    return sanitizedUrl;
  }

  if (looksLikeSql(trimmed)) {
    return REDACTED_SQL;
  }

  if (
    lower.includes("unknown column") ||
    lower.includes("field list") ||
    lower.includes("prismaclient") ||
    lower.includes("sqlstate") ||
    lower.includes("syntax error") ||
    lower.includes("table '") ||
    lower.includes("column '")
  ) {
    return "Database operation failed";
  }

  if (/\b\d{13,19}\b/.test(trimmed.replace(/[\s-]/g, ""))) {
    return REDACTED_CARD;
  }

  if (looksLikeEmail(trimmed)) {
    return maskEmail(trimmed);
  }

  return trimmed;
}

function truncateString(value: string, maxStringLength: number) {
  if (value.length <= maxStringLength) {
    return value;
  }

  return `${value.slice(0, maxStringLength)}${TRUNCATED}`;
}

function serializeError(
  error: ErrorLike,
  options: Required<SanitizerOptions>,
  seen: WeakSet<object>,
  depth: number,
) {
  const next: Record<string, unknown> = {
    name: sanitizePotentialSecretString(String(error.name ?? "Error")),
    message: sanitizePotentialSecretString(String(error.message ?? "Error")),
  };

  if (options.includeErrorStack && typeof error.stack === "string") {
    next.stack = truncateString(
      sanitizePotentialSecretString(error.stack),
      options.maxStringLength,
    );
  }

  if (error.cause !== undefined) {
    next.cause = sanitizeLogValue(
      error.cause,
      options,
      seen,
      depth + 1,
      "cause",
    );
  }

  return next;
}

function shouldFullyRedactKey(key: string) {
  const normalizedKey = normalizeKey(key);

  if (PRESERVED_IDENTIFIER_KEYS.has(normalizedKey)) {
    return false;
  }

  return SENSITIVE_KEY_PATTERNS.some((pattern) =>
    normalizedKey.includes(pattern),
  );
}

function shouldPartiallyMaskKey(key: string) {
  const normalizedKey = normalizeKey(key);

  if (PRESERVED_IDENTIFIER_KEYS.has(normalizedKey)) {
    return false;
  }

  return PARTIAL_MASK_KEY_PATTERNS.some((pattern) =>
    normalizedKey.includes(pattern),
  );
}

export function maskEmail(value: string) {
  const trimmed = value.trim();
  const [local, domain] = trimmed.split("@");

  if (!local || !domain) {
    return REDACTED;
  }

  const visibleLocal = local.slice(0, 2);
  return `${visibleLocal || "*"}***@${domain}`;
}

export function maskPhone(value: string) {
  const digits = value.replace(/\D/g, "");
  if (digits.length < 4) {
    return REDACTED;
  }

  return `${"*".repeat(Math.max(0, digits.length - 4))}${digits.slice(-4)}`;
}

export function sanitizeLogValue(
  value: unknown,
  options?: SanitizerOptions,
  seen = new WeakSet<object>(),
  depth = 0,
  key?: string | null,
): unknown {
  const resolvedOptions = {
    ...DEFAULT_OPTIONS,
    ...(options ?? {}),
  };

  try {
    if (value == null) {
      return value;
    }

    if (key && shouldFullyRedactKey(key)) {
      return REDACTED;
    }

    if (typeof value === "string") {
      if (key && shouldPartiallyMaskKey(key)) {
        if (normalizeKey(key).includes("email")) {
          return maskEmail(value);
        }

        if (normalizeKey(key).includes("phone")) {
          return maskPhone(value);
        }
      }

      return truncateString(
        sanitizePotentialSecretString(value),
        resolvedOptions.maxStringLength,
      );
    }

    if (
      typeof value === "number" ||
      typeof value === "boolean" ||
      typeof value === "bigint"
    ) {
      return value;
    }

    if (value instanceof Date) {
      return value.toISOString();
    }

    if (value instanceof URL) {
      return REDACTED;
    }

    if (value instanceof Error) {
      return serializeError(value, resolvedOptions, seen, depth);
    }

    if (typeof value !== "object") {
      return String(value);
    }

    if (seen.has(value)) {
      return CIRCULAR;
    }

    if (depth >= resolvedOptions.maxDepth) {
      return TRUNCATED;
    }

    seen.add(value);

    if (Array.isArray(value)) {
      const sanitized = value
        .slice(0, resolvedOptions.maxArrayLength)
        .map((entry) =>
          sanitizeLogValue(entry, resolvedOptions, seen, depth + 1, key),
        );

      if (value.length > resolvedOptions.maxArrayLength) {
        sanitized.push(
          `[${value.length - resolvedOptions.maxArrayLength} more items truncated]`,
        );
      }

      return sanitized;
    }

    if (!isPlainObject(value)) {
      return String(value);
    }

    const entries = Object.entries(value);
    const sanitizedEntries: Record<string, unknown> = {};

    for (const [entryKey, entryValue] of entries.slice(
      0,
      resolvedOptions.maxObjectKeys,
    )) {
      sanitizedEntries[entryKey] = sanitizeLogValue(
        entryValue,
        resolvedOptions,
        seen,
        depth + 1,
        entryKey,
      );
    }

    if (entries.length > resolvedOptions.maxObjectKeys) {
      sanitizedEntries.__truncatedKeys =
        entries.length - resolvedOptions.maxObjectKeys;
    }

    return sanitizedEntries;
  } catch {
    return REDACTED;
  }
}

export function sanitizeLogObject(
  value: Record<string, unknown>,
  options?: SanitizerOptions,
) {
  const sanitized = sanitizeLogValue(value, options);
  return typeof sanitized === "object" &&
    sanitized !== null &&
    !Array.isArray(sanitized)
    ? (sanitized as Record<string, unknown>)
    : {};
}

export { REDACTED };
