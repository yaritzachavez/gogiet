export type AuthorizationErrorCode = "UNAUTHORIZED" | "FORBIDDEN";

type AuthorizationErrorExtra = Record<string, unknown>;

const BLOCKED_EXTRA_KEYS = new Set([
  "debug",
  "details",
  "stack",
  "query",
  "queryused",
  "sql",
  "sqlmessage",
  "availablebusinesscolumns",
  "businessownersquery",
  "businessownersresult",
  "ownerbusinessesquery",
  "ownerbusinessesresult",
  "repairsources",
  "businessquery",
  "businessresult",
]);

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function sanitizeAuthorizationExtra(
  extra?: AuthorizationErrorExtra,
): AuthorizationErrorExtra | undefined {
  if (!extra) {
    return undefined;
  }

  const sanitized = Object.entries(extra).reduce<AuthorizationErrorExtra>(
    (accumulator, [key, value]) => {
      const normalizedKey = key
        .trim()
        .toLowerCase()
        .replace(/[_\s-]/g, "");
      if (BLOCKED_EXTRA_KEYS.has(normalizedKey)) {
        return accumulator;
      }

      if (isPlainObject(value)) {
        accumulator[key] = sanitizeAuthorizationExtra(value) ?? {};
        return accumulator;
      }

      accumulator[key] = value;
      return accumulator;
    },
    {},
  );

  return Object.keys(sanitized).length ? sanitized : undefined;
}

export function buildAuthorizationErrorPayload(params: {
  code: AuthorizationErrorCode;
  message?: string;
  extra?: AuthorizationErrorExtra;
}) {
  const sanitizedExtra = sanitizeAuthorizationExtra(params.extra);

  return {
    success: false,
    error: {
      code: params.code,
      message: params.message ?? "No autorizado",
    },
    ...(sanitizedExtra ?? {}),
  };
}
