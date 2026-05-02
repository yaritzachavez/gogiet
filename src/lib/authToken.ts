import jwt from "jsonwebtoken";
import type { NextRequest } from "next/server";

export function validateAuth(req: NextRequest): boolean {
  const auth = req.headers.get("authorization");
  if (!auth || !auth.startsWith("Bearer ")) return false;

  const token = auth.split(" ")[1];

  try {
    jwt.verify(token, process.env.JWT_SECRET || "gogi-dev-secret");
    return true;
  } catch (error) {
    console.error("❌ Token inválido:", error);
    return false;
  }
}
