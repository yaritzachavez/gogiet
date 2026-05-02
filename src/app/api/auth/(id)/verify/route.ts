// /api/auth/verify/route.ts
import jwt from "jsonwebtoken";
import { NextResponse } from "next/server";

export async function GET(req: Request) {
  try {
    const auth = req.headers.get("authorization");
    const secret = process.env.JWT_SECRET || "gogi-dev-secret";

    if (!auth?.startsWith("Bearer ")) {
      return NextResponse.json({ valid: false }, { status: 401 });
    }

    const token = auth.split(" ")[1];
    const decoded = jwt.verify(token, secret);
    return NextResponse.json({ valid: true, decoded });
  } catch {
    return NextResponse.json({ valid: false }, { status: 401 });
  }
}
