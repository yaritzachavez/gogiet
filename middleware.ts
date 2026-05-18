import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import {
  areInternalToolsEnabled,
  isInternalToolPath,
} from "@/lib/internal-tools";

export function middleware(req: NextRequest) {
  const requestId =
    req.headers.get("x-request-id")?.trim() || crypto.randomUUID();
  const requestHeaders = new Headers(req.headers);
  requestHeaders.set("x-request-id", requestId);

  if (isInternalToolPath(req.nextUrl.pathname) && !areInternalToolsEnabled()) {
    const response = new NextResponse("Not Found", { status: 404 });
    response.headers.set("x-request-id", requestId);
    return response;
  }

  const response = NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  });
  response.headers.set("x-request-id", requestId);
  return response;
}

export const config = {
  matcher: "/:path*",
};
