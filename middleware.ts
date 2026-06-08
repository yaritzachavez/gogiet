import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import {
  areInternalToolsEnabled,
  isInternalToolPath,
} from "@/lib/internal-tools";
import { resolveRequestId } from "@/lib/request-id";

function applySecurityHeaders(response: NextResponse) {
  response.headers.set("x-content-type-options", "nosniff");
  response.headers.set("referrer-policy", "strict-origin-when-cross-origin");
  response.headers.set(
    "permissions-policy",
    [
      "camera=()",
      "microphone=()",
      "usb=()",
      "geolocation=(self)",
      "payment=(self)",
    ].join(", "),
  );
  response.headers.set("content-security-policy", "frame-ancestors 'self';");

  if (process.env.VERCEL_ENV === "production") {
    response.headers.set(
      "strict-transport-security",
      "max-age=63072000; includeSubDomains; preload",
    );
  }

  return response;
}

export function middleware(req: NextRequest) {
  const requestId = resolveRequestId(req.headers);
  const requestHeaders = new Headers(req.headers);
  requestHeaders.set("x-request-id", requestId);

  if (isInternalToolPath(req.nextUrl.pathname) && !areInternalToolsEnabled()) {
    const response = applySecurityHeaders(
      new NextResponse("Not Found", { status: 404 }),
    );
    response.headers.set("x-request-id", requestId);
    return response;
  }

  const response = NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  });
  response.headers.set("x-request-id", requestId);
  return applySecurityHeaders(response);
}

export const config = {
  matcher: "/:path*",
};
