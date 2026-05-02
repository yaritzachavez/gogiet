import { NextResponse } from "next/server";
import jwt from "jsonwebtoken";
import pool from "@/lib/db";

export async function GET(
  req: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    // 1️⃣ Validar token
    const auth = req.headers.get("authorization");
    if (!auth?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Token no proporcionado" }, { status: 401 });
    }

    const token = auth.split(" ")[1];
    jwt.verify(token, process.env.JWT_SECRET as string);

    // 2️⃣ Obtener ID del usuario desde la URL
    const { id: userId } = await context.params;

    // 3️⃣ Obtener negocios donde ese user_id es owner
    const [businesses] = await pool.query<any[]>(
      `
      SELECT 
        b.id,
        b.name,
        b.city,
        b.district,
        b.address,
        b.status_id
      FROM business_owners bo
      INNER JOIN business b ON b.id = bo.business_id
      WHERE bo.user_id = ?;
      `,
      [userId]
    );

    return NextResponse.json({
      businesses: businesses ?? [],
    });
  } catch (error) {
    console.error("❌ Error GET /users/:id/businesses", error);
    return NextResponse.json(
      { error: "Error interno", details: (error as Error).message },
      { status: 500 }
    );
  }
}
