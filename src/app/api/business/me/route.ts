import type { RowDataPacket } from "mysql2/promise";
import { type NextRequest, NextResponse } from "next/server";

import { getAuthUser, isAdminGeneral } from "@/lib/admin-security";
import pool, { logDbUsage } from "@/lib/db";

type BusinessRow = RowDataPacket & {
  id: number;
  name: string;
  avatar_url: string | null;
  business_category_id: number | null;
  category_name: string | null;
  city: string | null;
  district: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  legal_name: string | null;
  tax_id: string | null;
  address_notes: string | null;
  created_at: string;
  updated_at: string;
  status_id: number | null;
  is_open_now: number | boolean | null;
  owner_id: number | null;
};

type HourRow = RowDataPacket & {
  day_of_week: number;
  open_time: string | null;
  close_time: string | null;
  is_closed: number | boolean | null;
};

type CountRow = RowDataPacket & {
  total: number | null;
};

type AssignedBusinessRow = RowDataPacket & {
  id: number;
  name: string;
  city: string | null;
  source: string;
};

type RawBusinessOwnerRow = RowDataPacket & {
  business_id: number;
  user_id: number;
  assigned_at: string | null;
  notes: string | null;
};

type UserRoleRow = RowDataPacket & {
  role_name: string;
};

type UserInfoRow = RowDataPacket & {
  email: string;
};

type BusinessAvatarColumnRow = RowDataPacket & {
  column_name: string;
};

function toPositiveNumber(value: string | null) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

async function businessHasAvatarColumn() {
  const [rows] = await pool.query<BusinessAvatarColumnRow[]>(
    `
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = DATABASE()
        AND table_name = 'business'
        AND column_name = 'avatar_url'
      LIMIT 1
    `,
  );

  return rows.length > 0;
}

export async function GET(req: NextRequest) {
  try {
    const authUser = getAuthUser(req);

    if (!authUser?.token) {
      return NextResponse.json(
        { success: false, error: "Token faltante" },
        { status: 401 },
      );
    }

    if (!authUser?.user) {
      return NextResponse.json(
        { success: false, error: "Token inválido" },
        { status: 401 },
      );
    }

    const requestedBusinessId = toPositiveNumber(
      req.nextUrl.searchParams.get("business_id"),
    );
    const [userInfoRows] = await pool.query<UserInfoRow[]>(
      `
        SELECT email
        FROM users
        WHERE id = ?
        LIMIT 1
      `,
      [authUser.user.id],
    );
    console.info("GET /api/business/me user_id:", authUser.user.id);

    const [roleRows] = await pool.query<UserRoleRow[]>(
      `
        SELECT r.name AS role_name
        FROM user_roles ur
        INNER JOIN roles r ON r.id = ur.role_id
        WHERE ur.user_id = ?
      `,
      [authUser.user.id],
    );
    console.info("GET /api/business/me user roles:", roleRows);
    console.info(
      "GET /api/business/me user email:",
      userInfoRows[0]?.email ?? null,
    );
    logDbUsage("/api/business/me", {
      userId: authUser.user.id,
      email: userInfoRows[0]?.email ?? null,
      role: roleRows.map((row) => row.role_name),
    });

    const [rawBusinessOwners] = await pool.query<RawBusinessOwnerRow[]>(
      `
        SELECT *
        FROM business_owners
        WHERE user_id = ?
      `,
      [authUser.user.id],
    );
    console.info(
      "GET /api/business/me raw business_owners query result:",
      rawBusinessOwners,
    );

    const [ownerBusinesses] = await pool.query<AssignedBusinessRow[]>(
      `
        SELECT b.id, b.name, b.city, 'owner' AS source
        FROM business_owners bo
        INNER JOIN business b ON b.id = bo.business_id
        WHERE bo.user_id = ?
        ORDER BY b.name ASC
      `,
      [authUser.user.id],
    );
    console.info(
      "GET /api/business/me business_owners result:",
      ownerBusinesses,
    );

    const [managerBusinesses] = await pool.query<AssignedBusinessRow[]>(
      `
        SELECT b.id, b.name, b.city, 'manager' AS source
        FROM business_managers bm
        INNER JOIN business b ON b.id = bm.business_id
        WHERE bm.user_id = ? AND COALESCE(bm.is_active, 1) = 1
        ORDER BY b.name ASC
      `,
      [authUser.user.id],
    );
    console.info(
      "GET /api/business/me business_managers result:",
      managerBusinesses,
    );

    const userIsAdminGeneral = await isAdminGeneral(authUser.user.id);
    const assignedBusinessesMap = new Map<number, AssignedBusinessRow>();

    for (const business of [...ownerBusinesses, ...managerBusinesses]) {
      assignedBusinessesMap.set(Number(business.id), business);
    }

    let assignedBusinesses = Array.from(assignedBusinessesMap.values());

    if (!assignedBusinesses.length && userIsAdminGeneral) {
      const [adminBusinesses] = await pool.query<AssignedBusinessRow[]>(
        `
          SELECT b.id, b.name, b.city, 'admin_general' AS source
          FROM business b
          WHERE COALESCE(b.status_id, 1) = 1
          ORDER BY b.name ASC
        `,
      );

      assignedBusinesses = adminBusinesses;
    }

    console.info(
      "GET /api/business/me available businesses:",
      assignedBusinesses,
    );

    if (!assignedBusinesses.length) {
      return NextResponse.json({
        success: true,
        business: null,
        businesses: [],
        message: "No tienes un negocio asignado",
        products_count: 0,
        active_orders_count: 0,
        completed_orders_count: 0,
        critical_inventory_count: 0,
        hours: [],
      });
    }

    const availableBusinessIds = new Set(
      assignedBusinesses.map((business) => Number(business.id)),
    );
    const businessId =
      requestedBusinessId && availableBusinessIds.has(requestedBusinessId)
        ? requestedBusinessId
        : Number(assignedBusinesses[0].id);

    const [rawBusinessRows] = await pool.query<RowDataPacket[]>(
      `
        SELECT *
        FROM business
        WHERE id = ?
      `,
      [businessId],
    );
    console.info(
      "GET /api/business/me raw business query result:",
      rawBusinessRows,
    );

    const hasAvatarColumn = await businessHasAvatarColumn();
    const avatarSelect = hasAvatarColumn
      ? "b.avatar_url"
      : "NULL AS avatar_url";

    const [rows] = await pool.query<BusinessRow[]>(
      `
        SELECT
          b.id,
          b.name,
          ${avatarSelect},
          bcm.category_id AS business_category_id,
          bc.name AS category_name,
          b.city,
          b.district,
          b.address,
          b.phone,
          b.email,
          b.legal_name,
          b.tax_id,
          b.address_notes,
          b.created_at,
          b.updated_at,
          b.status_id,
          b.is_open AS is_open_now,
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
    console.info("GET /api/business/me business result:", rows);

    const business = rows[0];

    if (!business) {
      return NextResponse.json({
        success: true,
        business: null,
        businesses: assignedBusinesses.map((assignedBusiness) => ({
          id: Number(assignedBusiness.id),
          name: assignedBusiness.name,
          city: assignedBusiness.city,
        })),
        message: "No tienes negocio asignado",
        products_count: 0,
        active_orders_count: 0,
        completed_orders_count: 0,
        critical_inventory_count: 0,
        hours: [],
      });
    }

    const [hoursRows] = await pool.query<HourRow[]>(
      `
        SELECT day_of_week, open_time, close_time, is_closed
        FROM business_hours
        WHERE business_id = ?
        ORDER BY day_of_week ASC
      `,
      [businessId],
    );

    const [productsCountRows] = await pool.query<CountRow[]>(
      `
        SELECT COUNT(*) AS total
        FROM products
        WHERE business_id = ? AND status_id = 1
      `,
      [businessId],
    );

    const [activeOrdersRows] = await pool.query<CountRow[]>(
      `
        SELECT COUNT(*) AS total
        FROM orders o
        LEFT JOIN order_status_catalog osc ON osc.id = o.order_status_id
        WHERE o.business_id = ?
          AND LOWER(TRIM(COALESCE(osc.name, ''))) NOT IN ('entregado', 'cancelado', 'pago_rechazado')
      `,
      [businessId],
    );

    const [completedOrdersRows] = await pool.query<CountRow[]>(
      `
        SELECT COUNT(*) AS total
        FROM orders o
        LEFT JOIN order_status_catalog osc ON osc.id = o.order_status_id
        WHERE o.business_id = ?
          AND LOWER(TRIM(COALESCE(osc.name, ''))) = 'entregado'
      `,
      [businessId],
    );

    const [criticalInventoryRows] = await pool.query<CountRow[]>(
      `
        SELECT COUNT(*) AS total
        FROM products
        WHERE business_id = ?
          AND status_id = 1
          AND COALESCE(stock_average, 0) <= COALESCE(NULLIF(stock_danger, 0), 10)
      `,
      [businessId],
    );

    return NextResponse.json({
      success: true,
      business: {
        id: Number(business.id),
        name: business.name,
        avatar_url: business.avatar_url ?? null,
        category: business.category_name,
        category_name: business.category_name,
        business_category_id: business.business_category_id,
        city: business.city,
        district: business.district,
        address: business.address,
        legal_name: business.legal_name,
        tax_id: business.tax_id,
        address_notes: business.address_notes,
        created_at: business.created_at,
        updated_at: business.updated_at,
        status: business.status_id,
        status_id: business.status_id,
        is_open_now: Boolean(business.is_open_now),
        business_owner: { user_id: business.owner_id ?? null },
      },
      businesses: assignedBusinesses.map((assignedBusiness) => ({
        id: Number(assignedBusiness.id),
        name: assignedBusiness.name,
        city: assignedBusiness.city,
      })),
      products_count: Number(productsCountRows[0]?.total ?? 0),
      active_orders_count: Number(activeOrdersRows[0]?.total ?? 0),
      completed_orders_count: Number(completedOrdersRows[0]?.total ?? 0),
      critical_inventory_count: Number(criticalInventoryRows[0]?.total ?? 0),
      hours: hoursRows.map((hour) => ({
        day_of_week: Number(hour.day_of_week),
        day_name:
          [
            "Lunes",
            "Martes",
            "Miércoles",
            "Jueves",
            "Viernes",
            "Sábado",
            "Domingo",
          ][Number(hour.day_of_week)] ?? "Día",
        open_time: hour.open_time,
        close_time: hour.close_time,
        is_closed: Boolean(hour.is_closed),
      })),
    });
  } catch (error) {
    console.error("Error GET /api/business/me:", {
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    return NextResponse.json(
      {
        success: false,
        error: "No se pudo cargar el negocio del usuario.",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}
