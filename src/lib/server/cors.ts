import { NextResponse } from "next/server";

const ALLOWED_ORIGINS = new Set([
  "https://www.gogieats.shop",
  "capacitor://localhost",
  "http://localhost",
  "http://127.0.0.1",
  "ionic://localhost",
]);

function resolveAllowedOrigin(req: Request) {
  const origin = req.headers.get("origin");

  if (origin && ALLOWED_ORIGINS.has(origin)) {
    return origin;
  }

  return "https://www.gogieats.shop";
}

export function withCors(req: Request, response: NextResponse) {
  response.headers.set("Access-Control-Allow-Origin", resolveAllowedOrigin(req));
  response.headers.set(
    "Access-Control-Allow-Methods",
    "GET,POST,OPTIONS",
  );
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
