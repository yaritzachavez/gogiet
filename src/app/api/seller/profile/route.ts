import type { ResultSetHeader, RowDataPacket } from "mysql2/promise";
import { type NextRequest, NextResponse } from "next/server";

import { getAuthUser } from "@/lib/admin-security";
import pool, { logDbUsage } from "@/lib/db";

type SellerProfileRow = RowDataPacket & {
  user_id: number;
  first_name: string;
  last_name: string | null;
  email: string;
  phone: string | null;
  user_status_name: string | null;
  assigned_at: string | null;
  position: string | null;
  is_active: number | boolean | null;
  business_id: number;
  business_name: string;
  business_phone: string | null;
};

type UserRoleRow = RowDataPacket & {
  role_name: string;
};

type UserRow = RowDataPacket & {
  user_id: number;
  first_name: string;
  last_name: string | null;
  email: string;
  phone: string | null;
  user_status_name: string | null;
  created_at: string;
};

type BusinessOwnerRow = RowDataPacket & {
  user_id: number;
  business_id: number;
  business_name: string;
  business_phone: string | null;
  assigned_at: string | null;
};

type OrderStatsRow = RowDataPacket & {
  total_orders: number | string | null;
};

type RecentOrderRow = RowDataPacket & {
  id: number;
  total_amount: string | number | null;
  created_at: string;
  status_name: string | null;
  customer_name: string | null;
};

function normalizeText(value: unknown) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function parseSellerEstado(params: {
  isActive: unknown;
  statusName: string | null;
  position: string | null;
}) {
  const normalizedStatusName = normalizeText(params.statusName);
  const normalizedPosition = normalizeText(params.position);

  if (
    !params.isActive ||
    ["inactivo", "bloqueado", "eliminado"].includes(normalizedStatusName)
  ) {
    return "Inactivo" as const;
  }

  if (normalizedPosition.includes("capacit")) {
    return "En capacitación" as const;
  }

  return "Activo" as const;
}

function getPerformanceLabel(orderCount: number) {
  if (orderCount >= 50) return "Alto";
  if (orderCount >= 10) return "Medio";
  return "Inicial";
}

function splitName(fullName: string) {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);

  return {
    firstName: parts[0] ?? "",
    lastName: parts.slice(1).join(" ") || null,
  };
}

function applyTrainingFlag(position: string | null, estado: string) {
  const basePosition = String(position ?? "Vendedor")
    .replace(/\s*\[capacitacion\]\s*$/i, "")
    .trim();

  if (estado === "En capacitación") {
    return `${basePosition || "Vendedor"} [capacitacion]`;
  }

  return basePosition || "Vendedor";
}

function normalizeRoleName(value: unknown) {
  return normalizeText(value);
}

async function getSellerContext(userId: number) {
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
    return {
      allowed: false,
      roles,
      user: null,
      profile: null,
      seller: null,
    };
  }

  const [userRows] = await pool.query<UserRow[]>(
    `
      SELECT
        u.id AS user_id,
        u.first_name,
        u.last_name,
        u.email,
        u.phone,
        sc.name AS user_status_name,
        u.created_at
      FROM users u
      LEFT JOIN status_catalog sc ON sc.id = u.status_id
      WHERE u.id = ?
      LIMIT 1
    `,
    [userId],
  );

  const user = userRows[0] ?? null;

  const [managerRows] = await pool.query<SellerProfileRow[]>(
    `
      SELECT
        u.id AS user_id,
        u.first_name,
        u.last_name,
        u.email,
        u.phone,
        sc.name AS user_status_name,
        bm.assigned_at,
        bm.position,
        bm.is_active,
        b.id AS business_id,
        b.name AS business_name,
        b.phone AS business_phone
      FROM business_managers bm
      INNER JOIN users u ON u.id = bm.user_id
      INNER JOIN business b ON b.id = bm.business_id
      LEFT JOIN status_catalog sc ON sc.id = u.status_id
      WHERE bm.user_id = ?
      ORDER BY bm.assigned_at DESC
      LIMIT 1
    `,
    [userId],
  );

  if (managerRows[0]) {
    const manager = managerRows[0];

    return {
      allowed: true,
      roles,
      user,
      profile: manager,
      seller: {
        user_id: Number(manager.user_id),
        business_id: Number(manager.business_id),
        business_name: manager.business_name,
        role: "vendedor",
      },
    };
  }

  const [ownerRows] = await pool.query<BusinessOwnerRow[]>(
    `
      SELECT
        bo.user_id,
        b.id AS business_id,
        b.name AS business_name,
        b.phone AS business_phone,
        bo.assigned_at
      FROM business_owners bo
      INNER JOIN business b ON b.id = bo.business_id
      WHERE bo.user_id = ?
      ORDER BY bo.assigned_at DESC
      LIMIT 1
    `,
    [userId],
  );

  if (ownerRows[0] && user) {
    const owner = ownerRows[0];

    return {
      allowed: true,
      roles,
      user,
      profile: {
        user_id: Number(user.user_id),
        first_name: user.first_name,
        last_name: user.last_name,
        email: user.email,
        phone: user.phone,
        user_status_name: user.user_status_name,
        assigned_at: owner.assigned_at,
        position: "Administrador del negocio",
        is_active: 1,
        business_id: Number(owner.business_id),
        business_name: owner.business_name,
        business_phone: owner.business_phone,
      } as SellerProfileRow,
      seller: {
        user_id: Number(owner.user_id),
        business_id: Number(owner.business_id),
        business_name: owner.business_name,
        role: "administrador_negocio",
      },
    };
  }

  if (roles.includes("admin_general") && user) {
    return {
      allowed: true,
      roles,
      user,
      profile: {
        user_id: Number(user.user_id),
        first_name: user.first_name,
        last_name: user.last_name,
        email: user.email,
        phone: user.phone,
        user_status_name: user.user_status_name,
        assigned_at: user.created_at,
        position: "Administrador general",
        is_active: 1,
        business_id: 0,
        business_name: "Sin negocio asignado",
        business_phone: null,
      } as SellerProfileRow,
      seller: {
        user_id: Number(user.user_id),
        business_id: 0,
        business_name: "Sin negocio asignado",
        role: "admin_general",
      },
    };
  }

  return {
    allowed: true,
    roles,
    user,
    profile: null,
    seller: null,
  };
}

export async function GET(req: NextRequest) {
  try {
    const authUser = getAuthUser(req);

    if (!authUser?.token) {
      return NextResponse.json(
        { success: false, error: "Token faltante", profile: null },
        { status: 401 },
      );
    }

    if (!authUser?.user) {
      return NextResponse.json(
        { success: false, error: "Token inválido", profile: null },
        { status: 401 },
      );
    }

    const userId = authUser.user.id;
    logDbUsage("/api/seller/profile", { userId });

    const context = await getSellerContext(userId);

    if (!context.allowed) {
      return NextResponse.json(
        {
          success: false,
          error: "No autorizado para acceder al panel de vendedor",
          profile: null,
          seller: null,
        },
        { status: 403 },
      );
    }

    const profile = context.profile;

    if (!profile) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Este usuario no tiene un negocio asignado. Asigna un negocio desde el panel administrador.",
          profile: null,
          seller: null,
        },
        { status: 404 },
      );
    }

    const [orderStatsRows] = await pool.query<OrderStatsRow[]>(
      `
        SELECT COUNT(*) AS total_orders
        FROM orders
        WHERE business_id = ?
      `,
      [profile.business_id],
    );

    const [recentOrderRows] = await pool.query<RecentOrderRow[]>(
      `
        SELECT
          o.id,
          o.total_amount,
          o.created_at,
          osc.name AS status_name,
          TRIM(CONCAT_WS(' ', cu.first_name, cu.last_name)) AS customer_name
        FROM orders o
        LEFT JOIN order_status_catalog osc ON osc.id = o.order_status_id
        LEFT JOIN users cu ON cu.id = o.user_id
        WHERE o.business_id = ?
        ORDER BY o.created_at DESC, o.id DESC
        LIMIT 8
      `,
      [profile.business_id],
    );

    const totalOrders = Number(orderStatsRows[0]?.total_orders ?? 0);

    return NextResponse.json({
      success: true,
      seller: context.seller,
      profile: {
        id: Number(profile.user_id),
        nombre: [profile.first_name, profile.last_name]
          .filter(Boolean)
          .join(" "),
        telefono: profile.phone ?? "",
        correo: profile.email,
        estado: parseSellerEstado({
          isActive: profile.is_active,
          statusName: profile.user_status_name,
          position: profile.position,
        }),
        desempeño: getPerformanceLabel(totalOrders),
        fechaIngreso: profile.assigned_at,
        businessId: Number(profile.business_id),
        businessName: profile.business_name,
        businessPhone: profile.business_phone ?? "",
        posicion: profile.position ?? "Vendedor",
        pedidosAtendidos: totalOrders,
        pedidosRecientes: recentOrderRows.map((order) => ({
          id: Number(order.id),
          total: Number(order.total_amount ?? 0),
          createdAt: String(order.created_at),
          status: String(order.status_name ?? "Pendiente"),
          customerName: order.customer_name ?? "Cliente",
        })),
      },
    });
  } catch (error) {
    console.error("Error GET /api/seller/profile:", error);
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "No se pudo cargar el perfil del vendedor.",
        profile: null,
      },
      { status: 500 },
    );
  }
}

export async function PATCH(req: NextRequest) {
  const connection = await pool.getConnection();

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

    const userId = authUser.user.id;
    const body = await req.json().catch(() => null);
    const nombre = String(body?.nombre ?? "").trim();
    const telefono = String(body?.telefono ?? "").trim();
    const estado = String(body?.estado ?? "").trim();

    if (!nombre) {
      return NextResponse.json(
        { success: false, error: "El nombre es obligatorio" },
        { status: 400 },
      );
    }

    if (!telefono) {
      return NextResponse.json(
        { success: false, error: "El teléfono es obligatorio" },
        { status: 400 },
      );
    }

    if (!["Activo", "En capacitación", "Inactivo"].includes(estado)) {
      return NextResponse.json(
        { success: false, error: "El estado es obligatorio" },
        { status: 400 },
      );
    }

    const context = await getSellerContext(userId);

    if (!context.allowed) {
      return NextResponse.json(
        {
          success: false,
          error: "No autorizado para editar este perfil",
        },
        { status: 403 },
      );
    }

    const profile = context.profile;

    if (!profile) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Este usuario no tiene un negocio asignado. Asigna un negocio desde el panel administrador.",
        },
        { status: 404 },
      );
    }

    const { firstName, lastName } = splitName(nombre);

    const [statusRows] = await connection.query<RowDataPacket[]>(
      `
        SELECT id, name
        FROM status_catalog
        WHERE name IN ('activo', 'inactivo')
      `,
    );

    const activeStatusId =
      Number(
        statusRows.find((row) => String(row.name) === "activo")?.id ?? 1,
      ) || 1;
    const inactiveStatusId =
      Number(
        statusRows.find((row) => String(row.name) === "inactivo")?.id ?? 2,
      ) || 2;

    await connection.beginTransaction();

    await connection.query<ResultSetHeader>(
      `
        UPDATE users
        SET
          first_name = ?,
          last_name = ?,
          phone = ?,
          status_id = ?,
          updated_at = NOW()
        WHERE id = ?
      `,
      [
        firstName,
        lastName,
        telefono,
        estado === "Inactivo" ? inactiveStatusId : activeStatusId,
        userId,
      ],
    );

    if (Number(profile.business_id) > 0) {
      await connection.query<ResultSetHeader>(
        `
          UPDATE business_managers
          SET
            is_active = ?,
            position = ?
          WHERE user_id = ? AND business_id = ?
        `,
        [
          estado === "Inactivo" ? 0 : 1,
          applyTrainingFlag(profile.position, estado),
          userId,
          profile.business_id,
        ],
      );
    }

    await connection.commit();

    return NextResponse.json({
      success: true,
      message: "Perfil actualizado correctamente",
    });
  } catch (error) {
    await connection.rollback();
    console.error("Error PATCH /api/seller/profile:", error);
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "No se pudo actualizar el perfil del vendedor.",
      },
      { status: 500 },
    );
  } finally {
    connection.release();
  }
}
