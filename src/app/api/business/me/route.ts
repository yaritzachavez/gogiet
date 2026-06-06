import type { RowDataPacket } from "mysql2/promise";
import { type NextRequest, NextResponse } from "next/server";

import { getAuthUser } from "@/lib/admin-security";
import {
  forbiddenResponse,
  unauthorizedResponse,
} from "@/lib/api-auth-response";
import { getSafeErrorMessage, logServerError } from "@/lib/api-error";
import {
  ensureBusinessHoursSchema,
  isBusinessOpenByHours,
} from "@/lib/business-hours";
import {
  ensureBusinessLogoColumn,
  getBusinessLogoSelect,
} from "@/lib/business-logo";
import { resolveBusinessAccess } from "@/lib/business-panel";
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

type UserInfoRow = RowDataPacket & {
  email: string;
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

export async function GET(req: NextRequest) {
  let userId: number | null = null;
  let email: string | null = null;
  let requestedBusinessId: number | null = null;
  let resolvedBusinessId: number | null = null;

  try {
    await ensureBusinessLogoColumn();

    const authUser = getAuthUser(req);

    if (!authUser?.token) {
      return unauthorizedResponse();
    }

    if (!authUser?.user) {
      return unauthorizedResponse();
    }

    requestedBusinessId = toPositiveNumber(
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
    userId = authUser.user.id;
    email = userInfoRows[0]?.email ?? null;
    const access = await resolveBusinessAccess(
      authUser.user.id,
      requestedBusinessId,
    );
    resolvedBusinessId = access.businessId;
    logDbUsage("/api/business/me", {
      userId: access.userId,
      email: access.email,
      role: access.roles,
    });

    if (!access.businessId) {
      return forbiddenResponse(
        {
          business: null,
          businesses: [],
          products_count: 0,
          active_orders_count: 0,
          completed_orders_count: 0,
          critical_inventory_count: 0,
          hours: [],
        },
        access.denialReason === "requested_business_forbidden"
          ? "No puedes acceder a ese negocio"
          : "No tienes un negocio asignado",
      );
    }

    const businessId = Number(access.businessId);

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

    if (!business) {
      return NextResponse.json(
        {
          success: false,
          error: "Negocio no encontrado",
          business: null,
          businesses: access.businesses.map((assignedBusiness) => ({
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
        },
        { status: 404 },
      );
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
      businesses: access.businesses.map((assignedBusiness) => ({
        id: Number(assignedBusiness.id),
        name: assignedBusiness.name,
        city: assignedBusiness.city,
        source: assignedBusiness.source,
      })),
      products_count: productsCount,
      active_orders_count: activeOrdersCount,
      completed_orders_count: completedOrdersCount,
      critical_inventory_count: criticalInventoryCount,
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
    logServerError("business.me.get_error", error, {
      userId,
      email,
      requestedBusinessId,
      resolvedBusinessId,
    });
    return NextResponse.json(
      {
        success: false,
        error: getSafeErrorMessage(
          error,
          "No se pudo cargar el negocio del usuario.",
        ),
      },
      { status: 500 },
    );
  }
}
