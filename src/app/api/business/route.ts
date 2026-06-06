import type { ResultSetHeader, RowDataPacket } from "mysql2/promise";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { ensureBusinessLogoColumn } from "@/lib/business-logo";
import { syncBusinessOwnerSafely } from "@/lib/business-owners";
import pool from "@/lib/db";
import { requireAdminGeneral } from "@/lib/permissions";

type BusinessListRow = RowDataPacket & {
  id: number;
  name: string;
  business_category_id: number | null;
  category_name: string | null;
  city: string | null;
  district: string | null;
  address: string | null;
  legal_name: string | null;
  tax_id: string | null;
  address_notes: string | null;
  phone: string | null;
  email: string | null;
  logo_url: string | null;
  cover_image_url: string | null;
  min_order_amount: number | null;
  estimated_delivery_minutes: number | null;
  rating_average: number | null;
  is_open_now: number | boolean | null;
  status_id: number | null;
  created_at: Date | string;
  updated_at: Date | string;
  owner_id: number | null;
};

type BusinessDetailRow = RowDataPacket & {
  id: number;
  name: string;
  legal_name: string | null;
  tax_id: string | null;
  city: string | null;
  district: string | null;
  address: string | null;
  address_notes: string | null;
  phone: string | null;
  email: string | null;
  logo_url: string | null;
  status_id: number | null;
  created_at: Date | string;
  updated_at: Date | string;
  business_category_id: number | null;
  category_name: string | null;
};

type CreateBusinessBody = {
  owner_id?: number | string | null;
  name?: string | null;
  business_category_id?: number | string | null;
  city?: string | null;
  district?: string | null;
  address?: string | null;
  legal_name?: string | null;
  tax_id?: string | null;
  address_notes?: string | null;
  phone?: string | null;
  email?: string | null;
  logo_url?: string | null;
  status_id?: number | string | null;
};

export async function GET(req: NextRequest) {
  try {
    await ensureBusinessLogoColumn();

    const admin = await requireAdminGeneral(req);
    if (!admin.ok) {
      return admin.response;
    }

    const [rows] = await pool.query<BusinessListRow[]>(`
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

    const negocios = rows.map((business) => ({
      ...business,
      business_owner: { user_id: business.owner_id ?? null },
    }));

    return NextResponse.json({ message: "OK", negocios }, { status: 200 });
  } catch (error) {
    console.error("Error al obtener negocios:", error);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const connection = await pool.getConnection();

  try {
    await ensureBusinessLogoColumn();

    const admin = await requireAdminGeneral(req);
    if (!admin.ok) {
      return admin.response;
    }

    const body: CreateBusinessBody = await req.json();
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

    const ownerId = Number(owner_id);
    const businessCategoryId = Number(business_category_id);
    const normalizedStatusId = Number(status_id);

    if (
      !ownerId ||
      !name ||
      !businessCategoryId ||
      !city ||
      !address ||
      !Number.isFinite(normalizedStatusId)
    ) {
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
          logo_url,
          status_id,
          created_at,
          updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
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
        normalizedStatusId,
      ],
    );

    const businessId = businessResult.insertId;

    await connection.query(
      `
        INSERT INTO business_category_map (business_id, category_id)
        VALUES (?, ?)
      `,
      [businessId, businessCategoryId],
    );

    const { alreadyAssigned: ownerAlreadyAssigned } =
      await syncBusinessOwnerSafely(connection, businessId, ownerId);

    await connection.query(
      `
        INSERT IGNORE INTO user_roles (user_id, role_id)
        SELECT ?, id FROM roles WHERE name = 'business_admin'
      `,
      [ownerId],
    );

    const [data] = await connection.query<BusinessDetailRow[]>(
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
        message: ownerAlreadyAssigned
          ? "Negocio creado correctamente. El dueño ya estaba asignado a este negocio."
          : "Negocio creado correctamente",
        owner_assignment_message: ownerAlreadyAssigned
          ? "El negocio ya tiene ese dueño asignado"
          : "Dueño asignado correctamente",
        business: data[0] ?? null,
      },
      { status: 201 },
    );
  } catch (error) {
    await connection.rollback();
    console.error("Error al crear negocio:", error);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  } finally {
    connection.release();
  }
}
