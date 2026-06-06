type ApiErrorPayload = {
  success?: boolean;
  error?: string;
  message?: string;
};

function normalizeMessage(value: unknown) {
  return String(value ?? "")
    .trim()
    .toLowerCase();
}

function mapTechnicalMessage(message: string) {
  const normalized = normalizeMessage(message);

  if (!normalized) return "";
  if (normalized.includes("network") || normalized.includes("fetch")) {
    return "Tu conexión se perdió. Revisa tu internet.";
  }
  if (
    normalized.includes("unauthorized") ||
    normalized.includes("token inválido")
  ) {
    return "Necesitas iniciar sesión para continuar.";
  }
  if (normalized.includes("forbidden")) {
    return "No tienes permisos para realizar esta acción.";
  }
  if (
    normalized.includes("internal server error") ||
    normalized.includes("server error")
  ) {
    return "No pudimos completar la acción. Intenta nuevamente.";
  }
  if (
    normalized.includes("bad request") ||
    normalized.includes("invalid input")
  ) {
    return "Revisa la información e intenta nuevamente.";
  }
  if (
    normalized.includes("duplicate") ||
    normalized.includes("p2002") ||
    normalized.includes("already registered")
  ) {
    return "Esta información ya está registrada.";
  }
  if (normalized.includes("null") || normalized.includes("undefined")) {
    return "No pudimos cargar la información correctamente.";
  }

  return message.trim();
}

export function getFriendlyErrorMessage(
  error: unknown,
  fallback = "No pudimos completar la acción. Intenta nuevamente.",
) {
  if (typeof error === "string") {
    return mapTechnicalMessage(error) || fallback;
  }

  if (error instanceof Error) {
    return mapTechnicalMessage(error.message) || fallback;
  }

  return fallback;
}

export function formatApiError(
  status: number,
  data?: ApiErrorPayload | null,
  fallback = "No pudimos completar la acción. Intenta nuevamente.",
) {
  const explicitMessage =
    (typeof data?.error === "string" && data.error.trim()) ||
    (typeof data?.message === "string" && data.message.trim()) ||
    "";

  if (explicitMessage) {
    return getFriendlyErrorMessage(explicitMessage, fallback);
  }

  if (status === 401) {
    return "Necesitas iniciar sesión para continuar.";
  }

  if (status === 403) {
    return "No tienes permisos para realizar esta acción.";
  }

  if (status === 404) {
    return "No encontramos la información solicitada.";
  }

  if (status === 409) {
    return "Esta información ya está registrada.";
  }

  if (status >= 500) {
    return "No pudimos completar la acción. Intenta nuevamente.";
  }

  return fallback;
}
