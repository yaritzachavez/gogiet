import type { RowDataPacket } from "mysql2/promise";
import { type NextRequest, NextResponse } from "next/server";

import { getAuthUser, isAdminGeneral } from "@/lib/admin-security";
import pool, { logDbUsage } from "@/lib/db";
import { mapDbRolesToPublicRoles } from "@/lib/role-utils";

type RoleRow = RowDataPacket & {
  name: string;
};

type UserRow = RowDataPacket & {
  id: number;
  email: string;
};

type BusinessOwnerRow = RowDataPacket & {
  business_id: number;
  user_id: number;
};

type BusinessManagerRow = RowDataPacket & {
  business_id: number;
  user_id: number;
  position: string | null;
  is_active: number | boolean | null;
};

type DeliveryProfileRow = RowDataPacket & {
  id: number;
};

type AccessItem = {
  key: string;
  title: string;
  href: string;
};

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

    const userId = authUser.user.id;

    const [userRows] = await pool.query<UserRow[]>(
      `
        SELECT id, email
        FROM users
        WHERE id = ?
        LIMIT 1
      `,
      [userId],
    );
    const user = userRows[0] ?? null;
    logDbUsage("/api/auth/access-center", {
      userId,
      email: user?.email ?? null,
    });

    const [roleRows] = await pool.query<RoleRow[]>(
      `
        SELECT r.name
        FROM user_roles ur
        INNER JOIN roles r ON r.id = ur.role_id
        WHERE ur.user_id = ?
      `,
      [userId],
    );

    const dbRoles = roleRows.map((row) => String(row.name));
    const publicRoles = mapDbRolesToPublicRoles(dbRoles);

    const [businessOwnerRows] = await pool.query<BusinessOwnerRow[]>(
      `
        SELECT *
        FROM business_owners
        WHERE user_id = ?
      `,
      [userId],
    );

    const [businessManagerRows] = await pool.query<BusinessManagerRow[]>(
      `
        SELECT *
        FROM business_managers
        WHERE user_id = ? AND COALESCE(is_active, 1) = 1
      `,
      [userId],
    );

    const [deliveryProfileRows] = await pool.query<DeliveryProfileRow[]>(
      `
        SELECT id
        FROM delivery
        WHERE driver_user_id = ?
        LIMIT 1
      `,
      [userId],
    );

    const adminGeneral = await isAdminGeneral(userId);
    const hasBusinessOwner = businessOwnerRows.length > 0;
    const hasBusinessManager = businessManagerRows.length > 0;
    const hasDeliveryProfile =
      deliveryProfileRows.length > 0 ||
      publicRoles.includes("REPARTIDOR") ||
      dbRoles.includes("repartidor");

    const access: AccessItem[] = [];

    if (adminGeneral) {
      access.push({
        key: "admin-general",
        title: "Administrador general",
        href: "/admin",
      });
    }

    if (adminGeneral || hasBusinessOwner) {
      access.push({
        key: "admin-negocio",
        title: "Administrador de negocio",
        href: "/business",
      });
    }

    if (adminGeneral || hasBusinessManager) {
      access.push({
        key: "vendedor",
        title: "Panel de vendedor",
        href: "/pickdash/seller",
      });
    }

    if (adminGeneral || hasDeliveryProfile) {
      access.push({
        key: "repartidor",
        title: "Zona de delivery",
        href: "/delivery",
      });
    }

    console.log("GET /api/auth/access-center userId:", userId);
    console.log("GET /api/auth/access-center email:", user?.email ?? null);
    console.log("GET /api/auth/access-center role:", publicRoles);
    console.log("GET /api/auth/access-center accesos encontrados:", access);
    logDbUsage("/api/auth/access-center", {
      userId,
      email: user?.email ?? null,
      role: publicRoles,
    });

    return NextResponse.json({
      success: true,
      user: {
        id: userId,
        email: user?.email ?? null,
        roles: publicRoles,
      },
      access,
      accessFlags: {
        admin: adminGeneral,
        businessOwner: hasBusinessOwner,
        businessManager: hasBusinessManager,
        customer: publicRoles.includes("CLIENTE"),
        delivery: hasDeliveryProfile,
      },
      businessOwner: businessOwnerRows,
      businessManager: businessManagerRows,
      deliveryProfile: hasDeliveryProfile,
    });
  } catch (error) {
    console.error("Error GET /api/auth/access-center:", error);
    return NextResponse.json(
      {
        success: false,
        error: "No se pudieron obtener los accesos del usuario.",
        details: error instanceof Error ? error.message : String(error),
        access: [],
      },
      { status: 500 },
    );
  }
}
