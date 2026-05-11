import { NextResponse } from "next/server";
import { handleCorsPreflight, withCors } from "@/lib/server/cors";

export function OPTIONS(req: Request) {
  return handleCorsPreflight(req);
}

export async function POST(req: Request) {
  const json = (body: unknown, init?: ResponseInit) =>
    withCors(req, NextResponse.json(body, init));

  return json(
    {
      success: false,
      error:
        "La verificación por correo está desactivada temporalmente en esta base.",
    },
    { status: 400 },
  );
}
