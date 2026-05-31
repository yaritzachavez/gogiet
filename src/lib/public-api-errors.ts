import { getSafeErrorMessage, logServerError } from "@/lib/api-error";

export function getPublicErrorMessage(error: unknown, fallback: string) {
  return getSafeErrorMessage(error, fallback);
}

export function logPublicApiError(
  event: string,
  error: unknown,
  context?: Record<string, unknown>,
) {
  logServerError(event, error, context);
}
