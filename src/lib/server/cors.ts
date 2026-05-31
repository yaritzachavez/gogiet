import { NextResponse } from "next/server";

const ALLOWED_ORIGINS = new Set([
  "https://gogieats.shop",
  "https://www.gogieats.shop",
  "capacitor://localhost",
  "http://localhost",
  "http://localhost:3000",
  "http://localhost:3001",
  "http://127.0.0.1",
  "http://127.0.0.1:3000",
  "http://127.0.0.1:3001",
  "ionic://localhost",
]);

const DEFAULT_ALLOWED_ORIGIN =
  process.env.NEXT_PUBLIC_APP_URL?.trim() || "https://www.gogieats.shop";

function resolveAllowedOrigin(req: Request) {
  const origin = req.headers.get("origin");

  if (origin && ALLOWED_ORIGINS.has(origin)) {
    return origin;
  }

  if (origin) {
    try {
      const parsedOrigin = new URL(origin);
      if (
        parsedOrigin.protocol === "http:" &&
        (parsedOrigin.hostname === "localhost" ||
          parsedOrigin.hostname === "127.0.0.1")
      ) {
        return origin;
      }
    } catch {}
  }

  return DEFAULT_ALLOWED_ORIGIN;
}

export function withCors(req: Request, response: NextResponse) {
  response.headers.set(
    "Access-Control-Allow-Origin",
    resolveAllowedOrigin(req),
  );
  response.headers.set("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  response.headers.set(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization, X-Requested-With",
  );
  response.headers.set("Access-Control-Allow-Credentials", "true");
  response.headers.set("Vary", "Origin");

  return response;
}

export function handleCorsPreflight(req: Request) {
  return withCors(req, new NextResponse(null, { status: 204 }));
}
