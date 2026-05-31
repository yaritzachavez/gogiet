import type { RowDataPacket } from "mysql2/promise";
import { type NextRequest, NextResponse } from "next/server";

import { getAuthUser, isAdminGeneral } from "@/lib/admin-security";
import { getSafeErrorMessage } from "@/lib/api-error";
import {
  ensureBusinessHoursSchema,
  isBusinessOpenByHours,
} from "@/lib/business-hours";
import {
  ensureBusinessLogoColumn,
  getBusinessLogoSelect,
} from "@/lib/business-logo";
import { syncBusinessOwnerSafely } from "@/lib/business-owners";
import pool, { logDbUsage } from "@/lib/db";

type BusinessRow = RowDataPacket & {
  id: number;
  name: string;
  logo_url: string | null;
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
  is_24_hours: number | boolean | null;
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

type ColumnExistsRow = RowDataPacket & {
  column_name: string;
};

type BusinessMeDebug = {
  userId: number | null;
  email: string | null;
  requestedBusinessId: number | null;
  availableBusinessColumns: string[];
  businessOwnersQuery: string | null;
  businessOwnersResult: Array<{
    business_id: number;
    user_id: number;
  }>;
  ownerBusinessesQuery: string | null;
  ownerBusinessesResult: Array<{
    id: number;
    name: string;
    source: string;
  }>;
  repairSources: string[];
  businessQuery: string | null;
  businessResult: {
    id: number | null;
    name: string | null;
  } | null;
};

async function countSafely(
  query: string,
  params: Array<number | string | null>,
) {
  try {
    const [rows] = await pool.query<CountRow[]>(query, params);
    return Number(rows[0]?.total ?? 0);
  } catch {
    return 0;
  }
}

function toPositiveNumber(value: string | null) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

async function tryRepairBusinessOwnerRelation(params: {
  userId: number;
  email: string | null;
  debug: BusinessMeDebug;
}) {
  const [businessColumns] = await pool.query<ColumnExistsRow[]>(
    `
      SELECT COLUMN_NAME AS column_name
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'business'
        AND COLUMN_NAME IN ('owner_id', 'owner_user_id', 'email')
    `,
  );

  const availableColumns = new Set(
    businessColumns.map((row) => String(row.column_name).toLowerCase()),
  );
  params.debug.availableBusinessColumns = Array.from(availableColumns);
  const candidateBusinesses = new Map<number, AssignedBusinessRow>();

  if (availableColumns.has("owner_id")) {
    const [ownerIdCandidates] = await pool.query<AssignedBusinessRow[]>(
      `
        SELECT b.id, b.name, b.city, 'owner_id_repair' AS source
        FROM business b
        WHERE b.owner_id = ?
        ORDER BY b.updated_at DESC, b.id DESC
      `,
      [params.userId],
    );

    for (const business of ownerIdCandidates) {
      candidateBusinesses.set(Number(business.id), business);
    }
  }

  if (availableColumns.has("owner_user_id")) {
    const [ownerUserIdCandidates] = await pool.query<AssignedBusinessRow[]>(
      `
        SELECT b.id, b.name, b.city, 'owner_user_id_repair' AS source
        FROM business b
        WHERE b.owner_user_id = ?
        ORDER BY b.updated_at DESC, b.id DESC
      `,
      [params.userId],
    );

    for (const business of ownerUserIdCandidates) {
      if (!candidateBusinesses.has(Number(business.id))) {
        candidateBusinesses.set(Number(business.id), business);
      }
    }
  }

  if (params.email && availableColumns.has("email")) {
    const [emailCandidates] = await pool.query<AssignedBusinessRow[]>(
      `
        SELECT b.id, b.name, b.city, 'email_repair' AS source
        FROM business b
        WHERE LOWER(TRIM(COALESCE(b.email, ''))) = LOWER(TRIM(?))
        ORDER BY b.updated_at DESC, b.id DESC
      `,
      [params.email],
    );

    for (const business of emailCandidates) {
      if (!candidateBusinesses.has(Number(business.id))) {
        candidateBusinesses.set(Number(business.id), business);
      }
    }
  }

  const repairedBusinesses = Array.from(candidateBusinesses.values());

  if (!repairedBusinesses.length) {
    return {
      repaired: false,
      source: null,
      businesses: [] as AssignedBusinessRow[],
    };
  }

  for (const business of repairedBusinesses) {
    await syncBusinessOwnerSafely(pool, Number(business.id), params.userId);
  }

  params.debug.repairSources = repairedBusinesses.map((business) =>
    String(business.source),
  );

  return {
    repaired: true,
    source: repairedBusinesses.map((business) => business.source).join(","),
    businesses: repairedBusinesses,
  };
}

export async function GET(req: NextRequest) {
  const debug: BusinessMeDebug = {
    userId: null,
    email: null,
    requestedBusinessId: null,
    availableBusinessColumns: [],
    businessOwnersQuery: null,
    businessOwnersResult: [],
    ownerBusinessesQuery: null,
    ownerBusinessesResult: [],
    repairSources: [],
    businessQuery: null,
    businessResult: null,
  };

  try {
    await ensureBusinessLogoColumn();

    const authUser = getAuthUser(req);

    if (!authUser?.token) {
      return NextResponse.json(
        {
          success: false,
          error: "Token faltante",
          details: "No se encontró token en Authorization ni en cookies.",
          debug,
        },
        { status: 401 },
      );
    }

    if (!authUser?.user) {
      return NextResponse.json(
        {
          success: false,
          error: "Token inválido",
          details: "No se pudo validar el JWT del usuario.",
          debug,
        },
        { status: 401 },
      );
    }

    const requestedBusinessId = toPositiveNumber(
      req.nextUrl.searchParams.get("business_id"),
    );
    debug.requestedBusinessId = requestedBusinessId;
    const [userInfoRows] = await pool.query<UserInfoRow[]>(
      `
        SELECT email
        FROM users
        WHERE id = ?
        LIMIT 1
      `,
      [authUser.user.id],
    );
    debug.userId = authUser.user.id;
    debug.email = userInfoRows[0]?.email ?? null;

    const [roleRows] = await pool.query<UserRoleRow[]>(
      `
        SELECT r.name AS role_name
        FROM user_roles ur
        INNER JOIN roles r ON r.id = ur.role_id
        WHERE ur.user_id = ?
      `,
      [authUser.user.id],
    );
    logDbUsage("/api/business/me", {
      userId: authUser.user.id,
      email: userInfoRows[0]?.email ?? null,
      role: roleRows.map((row) => row.role_name),
    });

    debug.businessOwnersQuery = `
        SELECT *
        FROM business_owners
        WHERE user_id = ?
      `.trim();
    const [rawBusinessOwners] = await pool.query<RawBusinessOwnerRow[]>(
      debug.businessOwnersQuery,
      [authUser.user.id],
    );
    debug.businessOwnersResult = rawBusinessOwners.map((row) => ({
      business_id: Number(row.business_id),
      user_id: Number(row.user_id),
    }));

    debug.ownerBusinessesQuery = `
        SELECT b.id, b.name, b.city, 'owner' AS source
        FROM business_owners bo
        INNER JOIN business b ON b.id = bo.business_id
        WHERE bo.user_id = ?
        ORDER BY b.name ASC
      `.trim();
    let [ownerBusinesses] = await pool.query<AssignedBusinessRow[]>(
      debug.ownerBusinessesQuery,
      [authUser.user.id],
    );
    debug.ownerBusinessesResult = ownerBusinesses.map((business) => ({
      id: Number(business.id),
      name: String(business.name),
      source: String(business.source),
    }));

    if (!ownerBusinesses.length) {
      const repairResult = await tryRepairBusinessOwnerRelation({
        userId: authUser.user.id,
        email: userInfoRows[0]?.email ?? null,
        debug,
      });

      if (repairResult.repaired) {
        ownerBusinesses = repairResult.businesses.map((business) => ({
          ...business,
          source: "owner_repaired",
        }));
        debug.ownerBusinessesResult = ownerBusinesses.map((business) => ({
          id: Number(business.id),
          name: String(business.name),
          source: String(business.source),
        }));
      }
    }

    const orphanedOwnerBusinessIds = rawBusinessOwners
      .map((row) => Number(row.business_id))
      .filter(
        (businessId) =>
          businessId > 0 &&
          !ownerBusinesses.some(
            (business) => Number(business.id) === Number(businessId),
          ),
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

    if (!assignedBusinesses.length) {
      return NextResponse.json({
        success: false,
        error:
          orphanedOwnerBusinessIds.length > 0
            ? "Tu negocio asignado ya no existe"
            : "No tienes un negocio asignado",
        debug:
          process.env.NODE_ENV === "production"
            ? undefined
            : {
                details:
                  orphanedOwnerBusinessIds.length > 0
                    ? "Se detectaron relaciones huérfanas en business_owners. Revisa la asignación del negocio."
                    : "No se encontró relación del usuario autenticado en business_owners ni coincidencia reparable por owner_id, owner_user_id o email.",
                context: debug,
              },
        business: null,
        businesses: [],
        orphaned_business_ids: orphanedOwnerBusinessIds,
        repair_required: orphanedOwnerBusinessIds.length > 0,
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

    debug.businessQuery = `
        SELECT *
        FROM business
        WHERE id = ?
      `.trim();
    const [_rawBusinessRows] = await pool.query<RowDataPacket[]>(
      debug.businessQuery,
      [businessId],
    );

    const avatarSelect = getBusinessLogoSelect("b");

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

    const business = rows[0];
    debug.businessResult = {
      id: business ? Number(business.id) : null,
      name: business?.name ?? null,
    };

    if (!business) {
      return NextResponse.json({
        success: false,
        error: "Negocio no encontrado",
        debug:
          process.env.NODE_ENV === "production"
            ? undefined
            : {
                details:
                  "La relación del usuario existe, pero el negocio asignado ya no está disponible en la tabla businesses.",
                context: debug,
              },
        business: null,
        businesses: assignedBusinesses.map((assignedBusiness) => ({
          id: Number(assignedBusiness.id),
          name: assignedBusiness.name,
          city: assignedBusiness.city,
        })),
        missing_business_id: businessId,
        repair_required: true,
        products_count: 0,
        active_orders_count: 0,
        completed_orders_count: 0,
        critical_inventory_count: 0,
        hours: [],
      });
    }

    await ensureBusinessHoursSchema(pool);

    let hoursRows: HourRow[] = [];
    try {
      const [resolvedHoursRows] = await pool.query<HourRow[]>(
        `
          SELECT day_of_week, open_time, close_time, is_closed, is_24_hours
          FROM business_hours
          WHERE business_id = ?
          ORDER BY day_of_week ASC
        `,
        [businessId],
      );
      hoursRows = resolvedHoursRows;
    } catch (error) {
      void error;
    }

    const productsCount = await countSafely(
      `
        SELECT COUNT(*) AS total
        FROM products
        WHERE business_id = ? AND status_id = 1
      `,
      [businessId],
    );

    const activeOrdersCount = await countSafely(
      `
        SELECT COUNT(*) AS total
        FROM orders o
        LEFT JOIN order_status_catalog osc ON osc.id = o.order_status_id
        WHERE o.business_id = ?
          AND LOWER(TRIM(COALESCE(osc.name, ''))) NOT IN ('entregado', 'cancelado', 'pago_rechazado')
      `,
      [businessId],
    );

    const completedOrdersCount = await countSafely(
      `
        SELECT COUNT(*) AS total
        FROM orders o
        LEFT JOIN order_status_catalog osc ON osc.id = o.order_status_id
        WHERE o.business_id = ?
          AND LOWER(TRIM(COALESCE(osc.name, ''))) = 'entregado'
      `,
      [businessId],
    );

    const criticalInventoryCount = await countSafely(
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
        logo_url: business.logo_url ?? null,
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
        is_open_now: isBusinessOpenByHours({
          statusId: Number(business.status_id ?? 1),
          fallbackOpen: Boolean(business.is_open_now),
          hours: hoursRows,
        }),
        business_owner: { user_id: business.owner_id ?? null },
      },
      businesses: assignedBusinesses.map((assignedBusiness) => ({
        id: Number(assignedBusiness.id),
        name: assignedBusiness.name,
        city: assignedBusiness.city,
      })),
      products_count: productsCount,
      active_orders_count: activeOrdersCount,
      completed_orders_count: completedOrdersCount,
      critical_inventory_count: criticalInventoryCount,
      debug,
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
        is_24_hours: Boolean(hour.is_24_hours),
      })),
    });
  } catch (error) {
    console.error("Error GET /api/business/me:", {
      userId: debug.userId,
      email: debug.email,
      queryUsed: debug.businessQuery,
      businessOwnersQuery: debug.businessOwnersQuery,
      businessOwnersResult: debug.businessOwnersResult,
      ownerBusinessesResult: debug.ownerBusinessesResult,
      businessResult: debug.businessResult,
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    return NextResponse.json(
      {
        success: false,
        error: getSafeErrorMessage(
          error,
          "No se pudo cargar el negocio del usuario.",
        ),
        debug: process.env.NODE_ENV === "production" ? undefined : debug,
      },
      { status: 500 },
    );
  }
}
