import jwt from "jsonwebtoken";
import { NextResponse } from "next/server";
import pool from "@/lib/db";

function validateBearer(req: Request) {
  const auth = req.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) return false;

  try {
    jwt.verify(auth.split(" ")[1], process.env.JWT_SECRET || "gogi-dev-secret");
    return true;
  } catch {
    return false;
  }
}

export async function GET(req: Request) {
  try {
    if (!validateBearer(req)) {
      return NextResponse.json(
        { error: "Token no proporcionado o inválido" },
        { status: 401 },
      );
    }

    const [rows] = await pool.query(`
      SELECT
        b.id,
        b.name,
        bcm.category_id AS business_category_id,
        bc.name AS category_name,
        b.city,
        b.district,
        b.address,
        b.legal_name,
        b.tax_id,
        b.address_notes,
        b.phone,
        b.email,
        b.logo_url,
        b.cover_image_url,
        b.min_order_amount,
        b.estimated_delivery_minutes,
        b.rating_average,
        b.is_open AS is_open_now,
        b.status_id,
        b.created_at,
        b.updated_at,
        bo.user_id AS owner_id
      FROM business b
      LEFT JOIN business_category_map bcm ON bcm.business_id = b.id
      LEFT JOIN business_categories bc ON bc.id = bcm.category_id
      LEFT JOIN business_owners bo ON bo.business_id = b.id
      ORDER BY b.id DESC
    `);

    const negocios = (rows as any[]).map((business) => ({
      ...business,
      business_owner: { user_id: business.owner_id ?? null },
    }));

    return NextResponse.json({ message: "OK", negocios }, { status: 200 });
  } catch (error) {
    console.error("Error al obtener negocios:", error);
    return NextResponse.json(
      { error: "Error interno", details: (error as Error).message },
      { status: 500 },
    );
  }
}

export async function POST(req: Request) {
  const connection = await pool.getConnection();

  try {
    if (!validateBearer(req)) {
      return NextResponse.json(
        { error: "Token no proporcionado o inválido" },
        { status: 401 },
      );
    }

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

    const [businessResult]: any = await connection.query(
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

    const [data]: any = await connection.query(
      `
        SELECT
          b.*,
          bcm.category_id AS business_category_id,
          bc.name AS category_name
        FROM business b
        LEFT JOIN business_category_map bcm ON bcm.business_id = b.id
        LEFT JOIN business_categories bc ON bc.id = bcm.category_id
        WHERE b.id = ?
        LIMIT 1
      `,
      [businessId],
    );

    await connection.commit();

    return NextResponse.json(
      {
        message: "Negocio creado correctamente",
        business: data[0],
      },
      { status: 201 },
    );
  } catch (error) {
    await connection.rollback();
    console.error("Error al crear negocio:", error);
    return NextResponse.json(
      { error: "Error interno", details: (error as Error).message },
      { status: 500 },
    );
  } finally {
    connection.release();
  }
}
