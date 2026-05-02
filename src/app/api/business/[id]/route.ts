import jwt from "jsonwebtoken";
import { type NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";

function validateAuth(req: NextRequest): boolean {
  const auth = req.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) return false;

  try {
    jwt.verify(auth.split(" ")[1], process.env.JWT_SECRET || "gogi-dev-secret");
    return true;
  } catch {
    return false;
  }
}

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    if (!validateAuth(req)) {
      return NextResponse.json(
        { error: "Token inválido o faltante" },
        { status: 401 },
      );
    }

    const { id } = await context.params;

    const [rows]: any = await pool.query(
      `
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
          b.created_at,
          b.updated_at,
          b.status_id,
          bo.user_id AS owner_id,
          bd.description_long,
          bd.slogan,
          bd.specialties,
          bd.service_notes,
          bd.accepts_pickup,
          bd.accepts_delivery,
          bd.has_own_delivery,
          bd.pet_friendly,
          bd.instagram_url,
          bd.facebook_url,
          bd.whatsapp_phone,
          bd.website_url
        FROM business b
        LEFT JOIN business_category_map bcm ON bcm.business_id = b.id
        LEFT JOIN business_categories bc ON bc.id = bcm.category_id
        LEFT JOIN business_owners bo ON bo.business_id = b.id
        LEFT JOIN business_details bd ON bd.business_id = b.id
        WHERE b.id = ?
        LIMIT 1
      `,
      [id],
    );

    if (!rows.length) {
      return NextResponse.json(
        { message: "Negocio no encontrado" },
        { status: 404 },
      );
    }

    const [hours]: any = await pool.query(
      `
        SELECT day_of_week, open_time, close_time, is_closed
        FROM business_hours
        WHERE business_id = ?
      `,
      [id],
    );

    const days = [
      "Lunes",
      "Martes",
      "Miércoles",
      "Jueves",
      "Viernes",
      "Sábado",
      "Domingo",
    ];

    const formattedHours = days.map((day, index) => {
      const found = hours.find((hour: any) => hour.day_of_week === index);

      return {
        day_of_week: index,
        day_name: day,
        open_time: found?.open_time ?? null,
        close_time: found?.close_time ?? null,
        is_closed: found ? Boolean(found.is_closed) : true,
      };
    });

    return NextResponse.json(
      {
        business: {
          ...rows[0],
          is_open_now: Boolean(rows[0].is_open_now),
          business_owner: { user_id: rows[0].owner_id ?? null },
        },
        hours: formattedHours,
      },
      { status: 200 },
    );
  } catch (error) {
    console.error("Error GET /business/:id:", error);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}

export async function PUT(
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const connection = await pool.getConnection();

  try {
    if (!validateAuth(req)) {
      return NextResponse.json(
        { error: "Token inválido o faltante" },
        { status: 401 },
      );
    }

    const { id: businessId } = await context.params;
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

    await connection.query(
      `
        UPDATE business SET
          name = ?,
          legal_name = ?,
          tax_id = ?,
          city = ?,
          district = ?,
          address = ?,
          address_notes = ?,
          phone = ?,
          email = ?,
          status_id = ?,
          updated_at = NOW()
        WHERE id = ?
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
        businessId,
      ],
    );

    await connection.query(
      "DELETE FROM business_category_map WHERE business_id = ?",
      [businessId],
    );
    await connection.query(
      "INSERT INTO business_category_map (business_id, category_id) VALUES (?, ?)",
      [businessId, business_category_id],
    );

    await connection.query(
      "DELETE FROM business_owners WHERE business_id = ?",
      [businessId],
    );
    await connection.query(
      "INSERT INTO business_owners (business_id, user_id) VALUES (?, ?)",
      [businessId, owner_id],
    );

    await connection.query(
      `
        INSERT IGNORE INTO user_roles (user_id, role_id)
        SELECT ?, id FROM roles WHERE name = 'business_admin'
      `,
      [owner_id],
    );

    const [updated]: any = await connection.query(
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
        message: "Negocio actualizado correctamente",
        business: updated[0],
      },
      { status: 200 },
    );
  } catch (error) {
    await connection.rollback();
    console.error("Error PUT /business/:id:", error);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  } finally {
    connection.release();
  }
}

export async function DELETE(
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    if (!validateAuth(req)) {
      return NextResponse.json(
        { error: "Token inválido o faltante" },
        { status: 401 },
      );
    }

    const { id } = await context.params;

    await pool.query(
      "DELETE FROM business_category_map WHERE business_id = ?",
      [id],
    );
    await pool.query("DELETE FROM business_owners WHERE business_id = ?", [id]);
    await pool.query("DELETE FROM business WHERE id = ?", [id]);

    return NextResponse.json({ message: "Negocio eliminado" }, { status: 200 });
  } catch (error) {
    console.error("Error DELETE /business/:id:", error);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
