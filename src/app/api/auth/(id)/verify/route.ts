// /api/auth/verify/route.ts
import jwt from "jsonwebtoken";
import { NextResponse } from "next/server";
import { handleCorsPreflight, withCors } from "@/lib/server/cors";

export function OPTIONS(req: Request) {
  return handleCorsPreflight(req);
}

export async function GET(req: Request) {
  try {
    const auth = req.headers.get("authorization");
    const secret = process.env.JWT_SECRET || "gogi-dev-secret";

    if (!auth?.startsWith("Bearer ")) {
      return withCors(req, NextResponse.json({ valid: false }, { status: 401 }));
    }

    const token = auth.split(" ")[1];
    const decoded = jwt.verify(token, secret);
    return withCors(req, NextResponse.json({ valid: true, decoded }));
  } catch {
    return withCors(req, NextResponse.json({ valid: false }, { status: 401 }));
  }
}
