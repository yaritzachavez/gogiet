import jwt from "jsonwebtoken";
import type { ResultSetHeader, RowDataPacket } from "mysql2/promise";
import { type NextRequest, NextResponse } from "next/server";

import pool from "@/lib/db";

type JwtPayload = {
  id: number;
  roles?: string[];
};

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

async function isAdminGeneral(userId: number) {
  const [rows] = await pool.query<RowDataPacket[]>(
    `
      SELECT 1
      FROM user_roles ur
      INNER JOIN roles r ON r.id = ur.role_id
      WHERE ur.user_id = ? AND r.name = 'admin_general'
      LIMIT 1
    `,
    [userId],
  );

  return rows.length > 0;
}

export async function POST(req: NextRequest) {
  const authUser = getAuthUser(req);

  if (!authUser) {
    return NextResponse.json(
      { error: "Token no proporcionado o inválido" },
      { status: 401 },
    );
  }

  if (!(await isAdminGeneral(authUser.id))) {
    return NextResponse.json(
      { error: "No autorizado para crear negocios" },
      { status: 403 },
    );
  }

  const connection = await pool.getConnection();

  try {
    const body = await req.json();
    const {
      owner_id,
      name,
      business_category_id,
      city,
      district,
      address,
      legal_name,
      tax_id,
      address_notes,
      phone,
      email,
      status_id = 1,
    } = body;

    if (!owner_id || !name || !business_category_id || !city || !address) {
      return NextResponse.json(
        {
          error:
            "owner_id, name, business_category_id, city y address son requeridos",
        },
        { status: 400 },
      );
    }

    await connection.beginTransaction();

    const [businessResult] = await connection.query<ResultSetHeader>(
      `
        INSERT INTO business (
          name,
          legal_name,
          tax_id,
          city,
          district,
          address,
          address_notes,
          phone,
          email,
          status_id,
          created_at,
          updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
      `,
      [
        name,
        legal_name ?? null,
        tax_id ?? null,
        city,
        district ?? null,
        address,
        address_notes ?? null,
        phone ?? null,
        email ?? null,
        status_id,
      ],
    );

    const businessId = businessResult.insertId;

    await connection.query(
      `
        INSERT INTO business_category_map (business_id, category_id)
        VALUES (?, ?)
      `,
      [businessId, business_category_id],
    );

    await connection.query(
      `
        INSERT INTO business_owners (business_id, user_id)
        VALUES (?, ?)
      `,
      [businessId, owner_id],
    );

    await connection.query(
      `
        INSERT IGNORE INTO user_roles (user_id, role_id)
        SELECT ?, id FROM roles WHERE name = 'business_admin'
      `,
      [owner_id],
    );

    const [rows] = await connection.query<RowDataPacket[]>(
      `
        SELECT
          b.*,
          bcm.category_id AS business_category_id,
          bc.name AS category_name,
          bo.user_id AS owner_id
        FROM business b
        LEFT JOIN business_category_map bcm ON bcm.business_id = b.id
        LEFT JOIN business_categories bc ON bc.id = bcm.category_id
        LEFT JOIN business_owners bo ON bo.business_id = b.id
        WHERE b.id = ?
        LIMIT 1
      `,
      [businessId],
    );

    await connection.commit();

    return NextResponse.json(
      {
        success: true,
        message: "Negocio creado correctamente",
        business: rows[0],
      },
      { status: 201 },
    );
  } catch (error) {
    await connection.rollback();
    console.error("Error POST /api/admin/businesses:", error);
    return NextResponse.json(
      {
        error: "Error interno",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  } finally {
    connection.release();
  }
}
