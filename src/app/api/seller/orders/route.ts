import type { RowDataPacket } from "mysql2/promise";
import { type NextRequest, NextResponse } from "next/server";

import { getAuthUser } from "@/lib/admin-security";
import pool, { logDbUsage } from "@/lib/db";

type SellerBusinessRow = RowDataPacket & {
  business_id: number;
};

type UserRoleRow = RowDataPacket & {
  role_name: string;
};

type OwnerBusinessRow = RowDataPacket & {
  business_id: number;
};

type SellerOrderRow = RowDataPacket & {
  id: number;
  total_amount: string | number | null;
  created_at: string;
  status_name: string | null;
  customer_name: string | null;
  payment_method: string | null;
};

function normalizeRoleName(value: unknown) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

async function resolveSellerBusinessId(userId: number) {
  const [roleRows] = await pool.query<UserRoleRow[]>(
    `
      SELECT r.name AS role_name
      FROM user_roles ur
      INNER JOIN roles r ON r.id = ur.role_id
      WHERE ur.user_id = ?
    `,
    [userId],
  );

  const roles = roleRows.map((row) => normalizeRoleName(row.role_name));
  const hasAllowedRole = roles.some((role) =>
    [
      "vendedor",
      "business_staff",
      "negocio",
      "administrador_negocio",
      "business_admin",
      "admin_general",
    ].includes(role),
  );

  if (!hasAllowedRole) {
    return { allowed: false, businessId: 0 };
  }

  const [managerRows] = await pool.query<SellerBusinessRow[]>(
    `
      SELECT business_id
      FROM business_managers
      WHERE user_id = ?
      ORDER BY assigned_at DESC
      LIMIT 1
    `,
    [userId],
  );

  if (managerRows[0]?.business_id) {
    return {
      allowed: true,
      businessId: Number(managerRows[0].business_id),
    };
  }

  const [ownerRows] = await pool.query<OwnerBusinessRow[]>(
    `
      SELECT business_id
      FROM business_owners
      WHERE user_id = ?
      ORDER BY assigned_at DESC
      LIMIT 1
    `,
    [userId],
  );

  if (ownerRows[0]?.business_id) {
    return {
      allowed: true,
      businessId: Number(ownerRows[0].business_id),
    };
  }

  if (roles.includes("admin_general")) {
    return { allowed: true, businessId: 0 };
  }

  return { allowed: true, businessId: 0 };
}

export async function GET(req: NextRequest) {
  try {
    const authUser = getAuthUser(req);

    if (!authUser?.token) {
      return NextResponse.json(
        { success: false, error: "Token faltante", orders: [] },
        { status: 401 },
      );
    }

    if (!authUser?.user) {
      return NextResponse.json(
        { success: false, error: "Token inválido", orders: [] },
        { status: 401 },
      );
    }

    const userId = authUser.user.id;
    logDbUsage("/api/seller/orders", { userId });
    const context = await resolveSellerBusinessId(userId);

    if (!context.allowed) {
      return NextResponse.json(
        {
          success: false,
          error: "No autorizado para acceder al panel de vendedor",
          orders: [],
        },
        { status: 403 },
      );
    }

    const businessId = context.businessId;

    if (!businessId) {
      return NextResponse.json({
        success: true,
        orders: [],
      });
    }

    const [orderRows] = await pool.query<SellerOrderRow[]>(
      `
        SELECT
          o.id,
          o.total_amount,
          o.created_at,
          osc.name AS status_name,
          TRIM(CONCAT_WS(' ', u.first_name, u.last_name)) AS customer_name,
          COALESCE(o.payment_method, pm.name) AS payment_method
        FROM orders o
        LEFT JOIN order_status_catalog osc ON osc.id = o.order_status_id
        LEFT JOIN users u ON u.id = o.user_id
        LEFT JOIN payment_methods pm ON pm.id = o.payment_method_id
        WHERE o.business_id = ?
        ORDER BY o.created_at DESC, o.id DESC
        LIMIT 25
      `,
      [businessId],
    );

    return NextResponse.json({
      success: true,
      orders: orderRows.map((order) => ({
        id: Number(order.id),
        total: Number(order.total_amount ?? 0),
        createdAt: String(order.created_at),
        status: String(order.status_name ?? "Pendiente"),
        customerName: order.customer_name ?? "Cliente",
        paymentMethod: order.payment_method ?? "Sin método",
      })),
    });
  } catch (error) {
    console.error("Error GET /api/seller/orders:", error);
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "No se pudieron cargar los pedidos del vendedor.",
        orders: [],
      },
      { status: 500 },
    );
  }
}
