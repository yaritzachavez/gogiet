const REQUEST_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/;

type HeaderGetter = {
  get(name: string): string | null;
};

export function isValidRequestId(value: unknown): value is string {
  return typeof value === "string" && REQUEST_ID_PATTERN.test(value.trim());
}

export function generateRequestId() {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return crypto.randomUUID();
  }

  return `req-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

export function resolveRequestId(
  headers?: Pick<HeaderGetter, "get"> | null,
  fallbackRequestId?: string | null,
) {
  const candidate =
    headers?.get("x-request-id")?.trim() ||
    headers?.get("x-correlation-id")?.trim() ||
    fallbackRequestId?.trim() ||
    null;

  if (candidate && isValidRequestId(candidate)) {
    return candidate;
  }

  return generateRequestId();
}
