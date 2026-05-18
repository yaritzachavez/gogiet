import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import {
  areInternalToolsEnabled,
  isInternalToolPath,
} from "@/lib/internal-tools";

export function middleware(req: NextRequest) {
  if (isInternalToolPath(req.nextUrl.pathname) && !areInternalToolsEnabled()) {
    return new NextResponse("Not Found", { status: 404 });
  }

  return NextResponse.next();
}

export const config = {
  matcher: "/:path*",
};
