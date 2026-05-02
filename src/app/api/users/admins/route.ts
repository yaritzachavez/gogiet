import jwt from "jsonwebtoken";
import { type NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { RowDataPacket } from "mysql2"; // Importante para el tipado

type JwtPayload = {
  id: number;
  roles?: string[];
};

// ✅ CORRECCIÓN: Cambiamos 'type' por 'interface' y extendemos 'RowDataPacket'
// Esto satisface el constraint 'QueryResult' que pide TypeScript
interface AdminUserRow extends RowDataPacket {
  id: number;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  status_id: number | null;
}

function getAuthUser(req: NextRequest) {
  const auth = req.headers.get("authorization");
  const token = auth?.startsWith("Bearer ")
    ? auth.split(" ")[1]
    : req.cookies.get("authToken")?.value;
  const secret = process.env.JWT_SECRET || "gogi-dev-secret";

  if (!token) return null;

  try {
    return jwt.verify(token, secret) as JwtPayload;
  } catch {
    return null;
  }
}

export async function GET(req: NextRequest) {
  try {
    const authUser = getAuthUser(req);

    if (!authUser) {
      return NextResponse.json(
        { success: false, error: "Token inválido o faltante", users: [] },
        { status: 401 },
      );
    }

    // ✅ Ahora este tipado <AdminUserRow[]> es 100% válido para mysql2
    const [rows] = await pool.query<AdminUserRow[]>(
      "SELECT id, first_name, last_name, email, phone, status_id FROM users WHERE role = 'admin'"
    );

    return NextResponse.json({
      success: true,
      // rows ya viene tipado como AdminUserRow[] gracias al generic de arriba
      users: rows, 
    });
  } catch (error) {
    console.error("Error GET /api/users/admins:", error);
    return NextResponse.json(
      {
        success: false,
        error: "No pudimos cargar los administradores en este momento.",
        details: error instanceof Error ? error.message : String(error),
        users: [],
      },
      { status: 500 },
    );
  }
}