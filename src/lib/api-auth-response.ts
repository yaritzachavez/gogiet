import { apiErrorResponse } from "./api-error";

type AuthorizationErrorExtra = Record<string, unknown>;

export function unauthorizedResponse(
  request?:
    | Request
    | { headers?: Pick<Headers, "get">; method?: string; url?: string }
    | null,
  extra?: AuthorizationErrorExtra,
  message = "No autorizado",
) {
  return apiErrorResponse(request, {
    code: "UNAUTHORIZED",
    message,
    extra,
  });
}

export function forbiddenResponse(
  request?:
    | Request
    | { headers?: Pick<Headers, "get">; method?: string; url?: string }
    | null,
  extra?: AuthorizationErrorExtra,
  message = "Acceso denegado",
) {
  return apiErrorResponse(request, {
    code: "FORBIDDEN",
    message,
    extra,
  });
}
