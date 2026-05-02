import type { ResultSetHeader, RowDataPacket } from "mysql2/promise";
import { type NextRequest, NextResponse } from "next/server";

import { getAuthUser, isAdminGeneral } from "@/lib/admin-security";
import pool from "@/lib/db";

type BusinessRow = RowDataPacket & {
  id: number;
  name: string;
  legal_name: string | null;
  city: string | null;
  district: string | null;
  address: string | null;
  address_notes: string | null;
  status_id: number | null;
  is_open: number | boolean | null;
  business_category_id: number | null;
  category_name: string | null;
  owner_id: number | null;
  created_at: Date | string;
  updated_at: Date | string;
};

function parsePositiveNumber(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

async function getBusinessRowById(businessId: number) {
  const [rows] = await pool.query<BusinessRow[]>(
    `
      SELECT
        b.id,
        b.name,
        b.legal_name,
        b.city,
        b.district,
        b.address,
        b.address_notes,
        b.status_id,
        b.is_open,
        bcm.category_id AS business_category_id,
        bc.name AS category_name,
        bo.user_id AS owner_id,
        b.created_at,
        b.updated_at
      FROM business b
      LEFT JOIN business_category_map bcm ON bcm.business_id = b.id
      LEFT JOIN business_categories bc ON bc.id = bcm.category_id
      LEFT JOIN business_owners bo ON bo.business_id = b.id
      WHERE b.id = ?
      LIMIT 1
    `,
    [businessId],
  );

  return rows[0] ?? null;
}

async function resolveCategoryId(rawCategory: unknown) {
  const numericCategoryId = parsePositiveNumber(rawCategory);
  if (numericCategoryId) return numericCategoryId;

  const categoryName = String(rawCategory ?? "").trim();
  if (!categoryName) return null;

  const [rows] = await pool.query<Array<{ id: number } & RowDataPacket>>(
    `
      SELECT id
      FROM business_categories
      WHERE name = ?
      LIMIT 1
    `,
    [categoryName],
  );

  return rows[0]?.id ?? null;
}

function mapBusinessRow(row: BusinessRow) {
  const isActive = Number(row.status_id ?? 0) === 1 && Boolean(row.is_open);

  return {
    id: row.id,
    name: row.name,
    legal_name: row.legal_name,
    city: row.city,
    district: row.district,
    address: row.address,
    address_notes: row.address_notes,
    status_id: row.status_id,
    business_category_id: row.business_category_id,
    category_name: row.category_name,
    owner_id: row.owner_id,
    created_at: row.created_at,
    updated_at: row.updated_at,
    business_owner: { user_id: row.owner_id ?? null },
    is_active: isActive,
    is_open_now: isActive,
  };
}

export async function GET(req: NextRequest) {
  try {
    const { user: authUser } = getAuthUser(req);

    if (!authUser) {
      return NextResponse.json(
        { success: false, error: "Token inválido o faltante" },
        { status: 401 },
      );
    }

    if (!(await isAdminGeneral(authUser.id))) {
      return NextResponse.json(
        { success: false, error: "No autorizado" },
        { status: 403 },
      );
    }

    const [rows] = await pool.query<BusinessRow[]>(
      `
        SELECT
          b.id,
          b.name,
          b.legal_name,
          b.city,
          b.district,
          b.address,
          b.address_notes,
          b.status_id,
          b.is_open,
          bcm.category_id AS business_category_id,
          bc.name AS category_name,
          bo.user_id AS owner_id,
          b.created_at,
          b.updated_at
        FROM business b
        LEFT JOIN business_category_map bcm ON bcm.business_id = b.id
        LEFT JOIN business_categories bc ON bc.id = bcm.category_id
        LEFT JOIN business_owners bo ON bo.business_id = b.id
        ORDER BY b.id DESC
      `,
    );

    return NextResponse.json({
      success: true,
      businesses: rows.map(mapBusinessRow),
    });
  } catch (error) {
    console.error("Error GET /api/admin/business:", error);
    return NextResponse.json(
      {
        success: false,
        error: "No se pudieron cargar los negocios.",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest) {
  const connection = await pool.getConnection();

  try {
    const { user: authUser } = getAuthUser(req);

    if (!authUser) {
      return NextResponse.json(
        { success: false, error: "Token inválido o faltante" },
        { status: 401 },
      );
    }

    if (!(await isAdminGeneral(authUser.id))) {
      return NextResponse.json(
        { success: false, error: "No autorizado" },
        { status: 403 },
      );
    }

    const body = await req.json();
    const ownerId = parsePositiveNumber(body.owner_id);
    const categoryId =
      (await resolveCategoryId(body.business_category_id)) ??
      (await resolveCategoryId(body.category_id)) ??
      (await resolveCategoryId(body.category));
    const name = String(body.name ?? "").trim();
    const city = String(body.city ?? "").trim();
    const district = String(body.district ?? "").trim();
    const address = String(body.address ?? "").trim();
    const legalName = String(body.legal_name ?? "").trim();
    const taxId = String(body.tax_id ?? "").trim();
    const addressNotes = String(body.address_notes ?? "").trim();

    if (!ownerId || !name || !categoryId || !city) {
      return NextResponse.json(
        {
          success: false,
          error: "owner_id, name, category y city son requeridos",
        },
        { status: 400 },
      );
    }

    await connection.beginTransaction();

    const [insertResult] = await connection.query<ResultSetHeader>(
      `
        INSERT INTO business (
          name,
          legal_name,
          tax_id,
          city,
          district,
          address,
          address_notes,
          status_id,
          is_open,
          created_at,
          updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, 1, 1, NOW(), NOW())
      `,
      [
        name,
        legalName || null,
        taxId || null,
        city,
        district || null,
        address || city,
        addressNotes || null,
      ],
    );

    const businessId = insertResult.insertId;

    await connection.query(
      `
        INSERT INTO business_category_map (business_id, category_id)
        VALUES (?, ?)
      `,
      [businessId, categoryId],
    );

    await connection.query(
      `
        INSERT INTO business_owners (business_id, user_id)
        VALUES (?, ?)
      `,
      [businessId, ownerId],
    );

    await connection.query(
      `
        INSERT IGNORE INTO user_roles (user_id, role_id)
        SELECT ?, id FROM roles WHERE name = 'business_admin'
      `,
      [ownerId],
    );

    await connection.commit();

    const business = await getBusinessRowById(businessId);

    return NextResponse.json(
      {
        success: true,
        message: "Negocio creado correctamente",
        business: business ? mapBusinessRow(business) : null,
      },
      { status: 201 },
    );
  } catch (error) {
    await connection.rollback();
    console.error("Error POST /api/admin/business:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Error al crear negocio",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  } finally {
    connection.release();
  }
}
