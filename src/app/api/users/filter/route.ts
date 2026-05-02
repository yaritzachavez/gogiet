import { NextResponse } from "next/server"
import pool from "@/lib/db"

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const onlyActive = searchParams.get("onlyActive") === "true"
    const role = searchParams.get("role") // opcional
    const query = searchParams.get("q") // para búsqueda por nombre o correo

    let baseQuery = `
    SELECT 
        id,
        first_name,
        last_name,
        email,
        status_id,
        created_at,
        updated_at
    FROM users
    WHERE 1 = 1
    `
    const params: any[] = []

    if (onlyActive) {
      baseQuery += " AND status_id = 1"
    }

    if (role) {
      baseQuery += " AND id IN (SELECT user_id FROM user_roles WHERE role_id = ?)"
      params.push(role)
    }

    if (query) {
      baseQuery += " AND (first_name LIKE ? OR last_name LIKE ? OR email LIKE ?)"
      params.push(`%${query}%`, `%${query}%`, `%${query}%`)
    }

    baseQuery += " ORDER BY first_name ASC"

    const [rows] = await pool.query(baseQuery, params)

    return NextResponse.json({ users: rows })
  } catch (error) {
    console.error("❌ Error en /api/users/filter:", error)
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 })
  }
}
