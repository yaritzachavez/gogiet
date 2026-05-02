import type { RowDataPacket } from "mysql2/promise";
import { type NextRequest, NextResponse } from "next/server";

import { getAuthUser } from "@/lib/admin-security";
import { resolveBusinessAccess } from "@/lib/business-panel";
import pool, { logDbUsage } from "@/lib/db";

type TeamMemberRow = RowDataPacket & {
  user_id: number;
  source: "owner" | "manager";
  first_name: string;
  last_name: string | null;
  email: string;
  phone: string | null;
  status_name: string | null;
  assigned_at: string | null;
  position: string | null;
  is_active: number | boolean | null;
  created_at: string;
};

type OwnerTeamRow = RowDataPacket & {
  user_id: number;
  first_name: string;
  last_name: string | null;
  email: string;
  phone: string | null;
  status_name: string | null;
  assigned_at: string | null;
  created_at: string;
};

type ManagerTeamRow = RowDataPacket & {
  user_id: number;
  first_name: string;
  last_name: string | null;
  email: string;
  phone: string | null;
  status_name: string | null;
  assigned_at: string | null;
  position: string | null;
  is_active: number | boolean | null;
  created_at: string;
};

type RecentOrderRow = RowDataPacket & {
  id: number;
  user_id: number;
  total_amount: string | number | null;
  created_at: string;
  status_name: string | null;
};

function normalizeText(value: unknown) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function parseSellerStatus(params: {
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

function toPositiveNumber(value: string | null) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

export async function GET(req: NextRequest) {
  try {
    const authUser = getAuthUser(req);

    if (!authUser?.token) {
      return NextResponse.json(
        { success: false, error: "Token faltante", team: [] },
        { status: 401 },
      );
    }

    if (!authUser?.user) {
      return NextResponse.json(
        { success: false, error: "Token inválido", team: [] },
        { status: 401 },
      );
    }

    const requestedBusinessId = toPositiveNumber(
      req.nextUrl.searchParams.get("business_id"),
    );
    const access = await resolveBusinessAccess(
      authUser.user.id,
      requestedBusinessId,
    );
    logDbUsage("/api/business/team", {
      userId: access.userId,
      email: access.email,
      role: access.roles,
    });

    if (!access.businessId) {
      return NextResponse.json({
        success: true,
        team: [],
      });
    }

    const businessId = access.businessId;

    const [ownerRows] = await pool.query<OwnerTeamRow[]>(
      `
        SELECT
          bo.user_id,
          u.first_name,
          u.last_name,
          u.email,
          u.phone,
          sc.name AS status_name,
          bo.assigned_at,
          CAST(NULL AS CHAR(100)) AS position,
          1 AS is_active,
          u.created_at
        FROM business_owners bo
        INNER JOIN users u ON u.id = bo.user_id
        LEFT JOIN status_catalog sc ON sc.id = u.status_id
        WHERE bo.business_id = ?
      `,
      [businessId],
    );

    const [managerRows] = await pool.query<ManagerTeamRow[]>(
      `
        SELECT
          bm.user_id,
          u.first_name,
          u.last_name,
          u.email,
          u.phone,
          sc.name AS status_name,
          bm.assigned_at,
          bm.position,
          bm.is_active,
          u.created_at
        FROM business_managers bm
        INNER JOIN users u ON u.id = bm.user_id
        LEFT JOIN status_catalog sc ON sc.id = u.status_id
        WHERE bm.business_id = ?
      `,
      [businessId],
    );

    const combinedTeamRows: TeamMemberRow[] = [
      ...ownerRows.map((row) => ({
        ...row,
        source: "owner" as const,
        position: null,
        is_active: 1,
      })),
      ...managerRows.map((row) => ({
        ...row,
        source: "manager" as const,
      })),
    ].sort((left, right) => {
      const leftAssignedAt = new Date(
        left.assigned_at ?? left.created_at,
      ).getTime();
      const rightAssignedAt = new Date(
        right.assigned_at ?? right.created_at,
      ).getTime();

      if (rightAssignedAt !== leftAssignedAt) {
        return rightAssignedAt - leftAssignedAt;
      }

      return Number(right.user_id) - Number(left.user_id);
    });

    const teamRows = Array.from(
      combinedTeamRows.reduce((accumulator, row) => {
        const key = Number(row.user_id);
        const existing = accumulator.get(key);

        if (!existing) {
          accumulator.set(key, row);
          return accumulator;
        }

        if (existing.source === "owner") {
          accumulator.set(key, {
            ...existing,
            position: existing.position ?? row.position,
            is_active: existing.is_active ?? row.is_active,
            assigned_at: existing.assigned_at ?? row.assigned_at,
          });
          return accumulator;
        }

        if (row.source === "owner") {
          accumulator.set(key, {
            ...row,
            position: row.position ?? existing.position,
            is_active: row.is_active ?? existing.is_active,
            assigned_at: row.assigned_at ?? existing.assigned_at,
          });
          return accumulator;
        }

        accumulator.set(key, existing);
        return accumulator;
      }, new Map<number, TeamMemberRow>()),
    ).map(([, row]) => row);

    const teamUserIds = teamRows.map((row) => Number(row.user_id));

    const [ordersByUserRows] = teamUserIds.length
      ? await pool.query<RowDataPacket[]>(
          `
            SELECT
              user_id,
              COUNT(*) AS total_orders
            FROM orders
            WHERE business_id = ?
              AND user_id IN (${teamUserIds.map(() => "?").join(", ")})
            GROUP BY user_id
          `,
          [businessId, ...teamUserIds],
        )
      : [[] as RowDataPacket[]];

    const [recentOrderRows] = teamUserIds.length
      ? await pool.query<RecentOrderRow[]>(
          `
            SELECT
              o.id,
              o.user_id,
              o.total_amount,
              o.created_at,
              osc.name AS status_name
            FROM orders o
            LEFT JOIN order_status_catalog osc ON osc.id = o.order_status_id
            WHERE o.business_id = ?
              AND o.user_id IN (${teamUserIds.map(() => "?").join(", ")})
            ORDER BY o.created_at DESC, o.id DESC
          `,
          [businessId, ...teamUserIds],
        )
      : [[] as RecentOrderRow[]];

    const orderCountByUserId = new Map<number, number>();
    for (const row of ordersByUserRows) {
      orderCountByUserId.set(
        Number(row.user_id),
        Number(row.total_orders ?? 0),
      );
    }

    const recentOrdersByUserId = new Map<
      number,
      Array<{
        id: number;
        total: number;
        createdAt: string;
        status: string;
      }>
    >();

    for (const row of recentOrderRows) {
      const key = Number(row.user_id);
      const bucket = recentOrdersByUserId.get(key) ?? [];

      if (bucket.length < 5) {
        bucket.push({
          id: Number(row.id),
          total: Number(row.total_amount ?? 0),
          createdAt: String(row.created_at),
          status: String(row.status_name ?? "Pendiente"),
        });
        recentOrdersByUserId.set(key, bucket);
      }
    }

    return NextResponse.json({
      success: true,
      team: teamRows.map((row) => {
        const userIdValue = Number(row.user_id);
        const fullName = [row.first_name, row.last_name]
          .filter(Boolean)
          .join(" ");
        const ordersCount = orderCountByUserId.get(userIdValue) ?? 0;

        return {
          id: userIdValue,
          nombre: fullName || `Usuario ${userIdValue}`,
          telefono: row.phone ?? "",
          correo: row.email,
          pedidos: ordersCount,
          estado: parseSellerStatus({
            isActive: row.is_active,
            statusName: row.status_name,
            position: row.position,
          }),
          desempeño: getPerformanceLabel(ordersCount),
          fechaIngreso: row.assigned_at ?? row.created_at,
          pedidosRecientes: recentOrdersByUserId.get(userIdValue) ?? [],
          source: row.source,
          posicion:
            row.position ??
            (row.source === "owner" ? "Propietario" : "Vendedor"),
        };
      }),
    });
  } catch (error) {
    console.error("Error GET /api/business/team:", error);
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "No se pudo cargar el equipo del negocio.",
        team: [],
      },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest) {
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

    const body = await req.json().catch(() => null);
    const selectedUserId = Number(body?.selected_user_id ?? 0);
    const estado = String(body?.estado ?? "Activo").trim();
    const posicion = String(body?.posicion ?? "Vendedor").trim() || "Vendedor";

    if (!Number.isInteger(selectedUserId) || selectedUserId <= 0 || !estado) {
      return NextResponse.json(
        {
          success: false,
          error: "Debes seleccionar un usuario registrado y un estado válido",
        },
        { status: 400 },
      );
    }

    const businessId = toPositiveNumber(String(body?.business_id ?? ""));
    const access = await resolveBusinessAccess(authUser.user.id, businessId);
    logDbUsage("/api/business/team", {
      userId: access.userId,
      email: access.email,
      role: access.roles,
    });

    if (!access.businessId) {
      return NextResponse.json(
        { success: false, error: "No tienes negocio asignado" },
        { status: 403 },
      );
    }

    const [userRows] = await pool.query<RowDataPacket[]>(
      `
        SELECT id, first_name, last_name, email
        FROM users
        WHERE id = ?
        LIMIT 1
      `,
      [selectedUserId],
    );

    const userId = Number(userRows[0]?.id ?? 0);

    if (!userId) {
      return NextResponse.json(
        {
          success: false,
          error: "El usuario seleccionado no existe.",
        },
        { status: 404 },
      );
    }

    const [existingRows] = await pool.query<RowDataPacket[]>(
      `
        SELECT user_id
        FROM business_managers
        WHERE business_id = ? AND user_id = ?
        LIMIT 1
      `,
      [access.businessId, userId],
    );

    if (existingRows.length) {
      return NextResponse.json(
        {
          success: false,
          error: "Este usuario ya está asignado como vendedor.",
        },
        { status: 409 },
      );
    }

    const [roleRows] = await pool.query<RowDataPacket[]>(
      `
        SELECT id
        FROM roles
        WHERE name IN ('business_staff', 'vendedor')
        ORDER BY FIELD(name, 'business_staff', 'vendedor')
        LIMIT 1
      `,
    );
    const roleId = Number(roleRows[0]?.id ?? 0);

    await pool.query(
      `
        INSERT INTO business_managers (
          business_id,
          user_id,
          position,
          is_active,
          assigned_at
        )
        VALUES (?, ?, ?, ?, NOW())
      `,
      [
        access.businessId,
        userId,
        estado === "En capacitación" ? `${posicion} [capacitacion]` : posicion,
        estado === "Inactivo" ? 0 : 1,
      ],
    );

    if (roleId) {
      await pool.query(
        `
          INSERT IGNORE INTO user_roles (user_id, role_id)
          VALUES (?, ?)
        `,
        [userId, roleId],
      );
    }

    return NextResponse.json({
      success: true,
      message: "Vendedor asignado correctamente",
      seller_user_id: userId,
      seller_name:
        `${String(userRows[0]?.first_name ?? "")} ${String(userRows[0]?.last_name ?? "")}`.trim() ||
        String(userRows[0]?.email ?? `Usuario ${userId}`),
    });
  } catch (error) {
    console.error("Error POST /api/business/team:", error);
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "No se pudo agregar el vendedor.",
      },
      { status: 500 },
    );
  }
}
