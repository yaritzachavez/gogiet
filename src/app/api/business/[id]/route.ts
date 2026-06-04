import type { RowDataPacket } from "mysql2/promise";
import { type NextRequest, NextResponse } from "next/server";
import { getSafeErrorMessage } from "@/lib/api-error";
import {
  ensureBusinessHoursSchema,
  isBusinessOpenByHours,
} from "@/lib/business-hours";
import { ensureBusinessLogoColumn } from "@/lib/business-logo";
import { syncBusinessOwnerSafely } from "@/lib/business-owners";
import pool from "@/lib/db";
import { requireAdminGeneral, requireBusinessAccess } from "@/lib/permissions";

type BusinessRow = RowDataPacket & {
  id: number;
  owner_id: number | null;
  logo_url: string | null;
  updated_at: string;
  status_id: number | null;
  is_open_now: number | boolean;
};

type BusinessHourRow = RowDataPacket & {
  day_of_week: number;
  open_time: string | null;
  close_time: string | null;
  is_closed: number | boolean;
  is_24_hours: number | boolean;
};

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    await ensureBusinessLogoColumn();

    const { id } = await context.params;
    const businessId = Number(id);

    if (!Number.isFinite(businessId) || businessId <= 0) {
      return NextResponse.json(
        { error: "ID de negocio inválido" },
        { status: 400 },
      );
    }

    const auth = await requireBusinessAccess(req, businessId);

    if (!auth.ok) {
      return auth.response;
    }

    const [rows] = await pool.query<BusinessRow[]>(
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
      [businessId],
    );

    if (!rows.length) {
      return NextResponse.json(
        { message: "Negocio no encontrado" },
        { status: 404 },
      );
    }

    await ensureBusinessHoursSchema(pool);

    const [hours] = await pool.query<BusinessHourRow[]>(
      `
        SELECT day_of_week, open_time, close_time, is_closed, is_24_hours
        FROM business_hours
        WHERE business_id = ?
      `,
      [businessId],
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
      const found = hours.find((hour) => hour.day_of_week === index);

      return {
        day_of_week: index,
        day_name: day,
        open_time: found?.open_time ?? null,
        close_time: found?.close_time ?? null,
        is_closed: found ? Boolean(found.is_closed) : true,
        is_24_hours: found ? Boolean(found.is_24_hours) : false,
      };
    });

    return NextResponse.json(
      {
        business: {
          ...rows[0],
          is_open_now: isBusinessOpenByHours({
            statusId: Number(rows[0].status_id ?? 1),
            fallbackOpen: Boolean(rows[0].is_open_now),
            hours,
          }),
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
    await ensureBusinessLogoColumn();

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
      logo_url,
      status_id = 1,
    } = body;
    const parsedBusinessId = Number(businessId);
    const parsedOwnerId = Number(owner_id);

    if (
      !Number.isFinite(parsedBusinessId) ||
      parsedBusinessId <= 0 ||
      !Number.isFinite(parsedOwnerId) ||
      parsedOwnerId <= 0
    ) {
      return NextResponse.json(
        {
          error: "owner_id o business_id inválido",
        },
        { status: 400 },
      );
    }

    if (!owner_id || !name || !business_category_id || !city || !address) {
      return NextResponse.json(
        {
          error:
            "owner_id, name, business_category_id, city y address son requeridos",
        },
        { status: 400 },
      );
    }

    const auth = await requireAdminGeneral(req);

    if (!auth.ok) {
      return auth.response;
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
          logo_url = ?,
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
        logo_url ?? null,
        status_id,
        parsedBusinessId,
      ],
    );

    await connection.query(
      "DELETE FROM business_category_map WHERE business_id = ?",
      [parsedBusinessId],
    );
    await connection.query(
      "INSERT INTO business_category_map (business_id, category_id) VALUES (?, ?)",
      [parsedBusinessId, business_category_id],
    );

    await syncBusinessOwnerSafely(connection, parsedBusinessId, parsedOwnerId);

    await connection.query(
      `
        INSERT IGNORE INTO user_roles (user_id, role_id)
        SELECT ?, id FROM roles WHERE name = 'business_admin'
      `,
      [owner_id],
    );

    const [updated] = await connection.query<BusinessRow[]>(
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
      [parsedBusinessId],
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

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    await ensureBusinessLogoColumn();

    const { id } = await context.params;
    const businessId = Number(id);

    if (!Number.isFinite(businessId) || businessId <= 0) {
      return NextResponse.json(
        { success: false, error: "ID de negocio inválido" },
        { status: 400 },
      );
    }

    const auth = await requireBusinessAccess(req, businessId);

    if (!auth.ok) {
      return auth.response;
    }

    const body = await req.json();
    const rawLogoUrl = body.logo_url ?? body.image_url ?? null;
    const logoUrl =
      rawLogoUrl === null || rawLogoUrl === undefined
        ? null
        : String(rawLogoUrl).trim() || null;

    await pool.query(
      `
        UPDATE business
        SET logo_url = ?, updated_at = NOW()
        WHERE id = ?
      `,
      [logoUrl, businessId],
    );

    const [rows] = await pool.query<BusinessRow[]>(
      `
        SELECT id, logo_url, updated_at
        FROM business
        WHERE id = ?
        LIMIT 1
      `,
      [businessId],
    );

    return NextResponse.json({
      success: true,
      business: rows[0] ?? {
        id: businessId,
        logo_url: logoUrl,
      },
    });
  } catch (error) {
    console.error("Error PATCH /business/:id:", error);
    return NextResponse.json(
      {
        success: false,
        error: getSafeErrorMessage(error, "No se pudo actualizar el negocio."),
      },
      { status: 500 },
    );
  }
}

export async function DELETE(
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await requireAdminGeneral(req);

    if (!auth.ok) {
      return auth.response;
    }

    const { id } = await context.params;
    const businessId = Number(id);

    if (!Number.isFinite(businessId) || businessId <= 0) {
      return NextResponse.json(
        { error: "ID de negocio inválido" },
        { status: 400 },
      );
    }

    await pool.query(
      "DELETE FROM business_category_map WHERE business_id = ?",
      [businessId],
    );
    await pool.query("DELETE FROM business_owners WHERE business_id = ?", [
      businessId,
    ]);
    await pool.query("DELETE FROM business WHERE id = ?", [businessId]);

    return NextResponse.json({ message: "Negocio eliminado" }, { status: 200 });
  } catch (error) {
    console.error("Error DELETE /business/:id:", error);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
