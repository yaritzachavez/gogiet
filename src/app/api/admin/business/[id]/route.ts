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

async function getBusinessById(id: number) {
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
    [id],
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

function mapBusiness(row: BusinessRow) {
  const isActive = Number(row.status_id ?? 0) === 1 && Boolean(row.is_open);

  return {
    id: row.id,
    name: row.name,
    legal_name: row.legal_name,
    city: row.city,
    district: row.district,
    address: row.address,
    address_notes: row.address_notes,
    business_category_id: row.business_category_id,
    category_name: row.category_name,
    owner_id: row.owner_id,
    status_id: row.status_id,
    is_active: isActive,
    is_open_now: isActive,
    created_at: row.created_at,
    updated_at: row.updated_at,
    business_owner: { user_id: row.owner_id ?? null },
  };
}

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
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

    const { id } = await context.params;
    const businessId = parsePositiveNumber(id);

    if (!businessId) {
      return NextResponse.json(
        { success: false, error: "Negocio inválido" },
        { status: 400 },
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
    const isActive =
      typeof body.is_active === "boolean"
        ? body.is_active
        : Number(body.status_id ?? 1) === 1;

    if (!name || !city) {
      return NextResponse.json(
        { success: false, error: "Nombre y ciudad son obligatorios" },
        { status: 400 },
      );
    }

    await connection.beginTransaction();

    await connection.query<ResultSetHeader>(
      `
        UPDATE business
        SET
          name = ?,
          legal_name = ?,
          tax_id = ?,
          city = ?,
          district = ?,
          address = ?,
          address_notes = ?,
          status_id = ?,
          is_open = ?,
          updated_at = NOW()
        WHERE id = ?
      `,
      [
        name,
        legalName || null,
        taxId || null,
        city,
        district || null,
        address || city,
        addressNotes || null,
        isActive ? 1 : 2,
        isActive ? 1 : 0,
        businessId,
      ],
    );

    if (categoryId) {
      await connection.query(
        "DELETE FROM business_category_map WHERE business_id = ?",
        [businessId],
      );
      await connection.query(
        `
          INSERT INTO business_category_map (business_id, category_id)
          VALUES (?, ?)
        `,
        [businessId, categoryId],
      );
    }

    if (ownerId) {
      await connection.query(
        "DELETE FROM business_owners WHERE business_id = ?",
        [businessId],
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
    }

    await connection.commit();

    const business = await getBusinessById(businessId);

    return NextResponse.json({
      success: true,
      message: "Negocio actualizado",
      business: business ? mapBusiness(business) : null,
    });
  } catch (error) {
    await connection.rollback();
    console.error("Error PATCH /api/admin/business/[id]:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Error al actualizar negocio",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  } finally {
    connection.release();
  }
}
