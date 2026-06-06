import { NextResponse } from "next/server";

import { buildAuthorizationErrorPayload } from "./api-auth-payload";

type AuthorizationErrorExtra = Record<string, unknown>;

export function unauthorizedResponse(
  extra?: AuthorizationErrorExtra,
  message = "No autorizado",
) {
  return NextResponse.json(
    buildAuthorizationErrorPayload({
      code: "UNAUTHORIZED",
      message,
      extra,
    }),
    { status: 401 },
  );
}

export function forbiddenResponse(
  extra?: AuthorizationErrorExtra,
  message = "Acceso denegado",
) {
  return NextResponse.json(
    buildAuthorizationErrorPayload({
      code: "FORBIDDEN",
      message,
      extra,
    }),
    { status: 403 },
  );
}
