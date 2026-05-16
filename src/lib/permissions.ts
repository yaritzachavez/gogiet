import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import type { RowDataPacket } from "mysql2/promise";

import { getAuthUser } from "@/lib/admin-security";
import { resolveBusinessAccess } from "@/lib/business-panel";
import pool from "@/lib/db";
import { resolveDeliveryAccess } from "@/lib/delivery-access";
import {
  type DbRoleName,
  mapDbRolesToPublicRoles,
  normalizeRoleInput,
  type PublicRoleName,
} from "@/lib/role-utils";

export const PERMISSIONS = {
  VALIDATE_PAYMENT: ["ADMIN_GENERAL"],
  MANAGE_GLOBAL_ROLES: ["ADMIN_GENERAL"],
  VIEW_ALL_USERS: ["ADMIN_GENERAL"],
  VIEW_ALL_ORDERS: ["ADMIN_GENERAL"],
  REASSIGN_DRIVER: ["ADMIN_GENERAL"],
  MANAGE_OWN_BUSINESS: ["ADMIN_NEGOCIO"],
  MANAGE_OWN_BUSINESS_PRODUCTS: ["ADMIN_NEGOCIO", "VENDEDOR"],
  VIEW_OWN_BUSINESS_ORDERS: ["ADMIN_NEGOCIO", "VENDEDOR"],
  ACCEPT_DELIVERY: ["REPARTIDOR"],
  VIEW_ASSIGNED_DELIVERIES: ["REPARTIDOR"],
  VIEW_OWN_ORDERS: ["CLIENTE"],
} as const;

export type Permission = keyof typeof PERMISSIONS;

export type PermissionAccessContext = {
  userId: number;
  token: string;
  email: string | null;
  dbRoles: DbRoleName[];
  roles: PublicRoleName[];
};

type UserRoleRow = RowDataPacket & {
  email: string | null;
  role_name: string | null;
};

type PermissionResource = {
  businessId?: number | null;
  customerUserId?: number | null;
  driverUserId?: number | null;
  assignedBusinessIds?: number[];
};

function permissionDenied(message: string) {
  return NextResponse.json({ success: false, error: message }, { status: 403 });
}

export async function getPermissionAccessContext(
  req: NextRequest,
): Promise<PermissionAccessContext | null> {
  const auth = getAuthUser(req);

  if (!auth.token || !auth.user) {
    return null;
  }

  const [rows] = await pool.query<UserRoleRow[]>(
    `
      SELECT u.email, r.name AS role_name
      FROM users u
      LEFT JOIN user_roles ur ON ur.user_id = u.id
      LEFT JOIN roles r ON r.id = ur.role_id
      WHERE u.id = ?
    `,
    [auth.user.id],
  );

  const dbRoles = Array.from(
    new Set(
      rows
        .map((row) => normalizeRoleInput(row.role_name))
        .filter((role): role is DbRoleName => Boolean(role)),
    ),
  );

  const roles = mapDbRolesToPublicRoles(dbRoles);

  return {
    userId: auth.user.id,
    token: auth.token,
    email: rows[0]?.email ?? null,
    dbRoles,
    roles,
  };
}

export async function requireAuth(req: NextRequest) {
  const access = await getPermissionAccessContext(req);

  if (!access) {
    return {
      ok: false as const,
      response: NextResponse.json(
        { success: false, error: "Necesitas iniciar sesión para continuar." },
        { status: 401 },
      ),
    };
  }

  return { ok: true as const, access };
}

export function canUserPerformAction(
  access: PermissionAccessContext,
  permission: Permission,
  resource?: PermissionResource,
) {
  const allowedRoles = PERMISSIONS[permission] as readonly PublicRoleName[];
  const hasGlobalRole = access.roles.some((role) => allowedRoles.includes(role));

  if (!hasGlobalRole) {
    return false;
  }

  if (
    permission === "MANAGE_OWN_BUSINESS" ||
    permission === "MANAGE_OWN_BUSINESS_PRODUCTS" ||
    permission === "VIEW_OWN_BUSINESS_ORDERS"
  ) {
    if (access.roles.includes("ADMIN_GENERAL")) return true;
    const businessId = Number(resource?.businessId ?? 0);
    const assignedBusinessIds = resource?.assignedBusinessIds ?? [];
    return businessId > 0 && assignedBusinessIds.includes(businessId);
  }

  if (permission === "VIEW_OWN_ORDERS") {
    return Number(resource?.customerUserId ?? 0) === access.userId;
  }

  if (
    permission === "ACCEPT_DELIVERY" ||
    permission === "VIEW_ASSIGNED_DELIVERIES"
  ) {
    const driverUserId = Number(resource?.driverUserId ?? 0);
    return access.roles.includes("ADMIN_GENERAL") || driverUserId === access.userId;
  }

  return true;
}

export async function requirePermission(
  req: NextRequest,
  permission: Permission,
  resource?: PermissionResource,
  deniedMessage = "No tienes permiso para realizar esta acción.",
) {
  const auth = await requireAuth(req);
  if (!auth.ok) return auth;

  if (!canUserPerformAction(auth.access, permission, resource)) {
    return {
      ok: false as const,
      response: permissionDenied(deniedMessage),
    };
  }

  return { ok: true as const, access: auth.access };
}

export async function requireAdminGeneral(req: NextRequest) {
  return requirePermission(
    req,
    "MANAGE_GLOBAL_ROLES",
    undefined,
    "Solo el administrador general puede realizar esta acción.",
  );
}

export async function requireBusinessAccess(
  req: NextRequest,
  businessId: number,
  permission:
    | "MANAGE_OWN_BUSINESS"
    | "MANAGE_OWN_BUSINESS_PRODUCTS"
    | "VIEW_OWN_BUSINESS_ORDERS" = "MANAGE_OWN_BUSINESS",
  deniedMessage = "No puedes modificar un negocio que no te pertenece.",
) {
  const auth = await requireAuth(req);
  if (!auth.ok) return auth;

  const businessAccess = await resolveBusinessAccess(auth.access.userId, businessId);
  const allowed = canUserPerformAction(auth.access, permission, {
    businessId,
    assignedBusinessIds: businessAccess.businessIds,
  });

  if (!allowed) {
    return {
      ok: false as const,
      response: permissionDenied(deniedMessage),
    };
  }

  return {
    ok: true as const,
    access: auth.access,
    businessAccess,
  };
}

export async function requireDriverAccess(
  req: NextRequest,
  driverUserId?: number | null,
  permission: "ACCEPT_DELIVERY" | "VIEW_ASSIGNED_DELIVERIES" =
    "VIEW_ASSIGNED_DELIVERIES",
  deniedMessage = "No puedes modificar pedidos de otro repartidor.",
) {
  const auth = await requireAuth(req);
  if (!auth.ok) return auth;

  const deliveryAccess = await resolveDeliveryAccess(auth.access.userId);

  if (!deliveryAccess.allowed) {
    return {
      ok: false as const,
      response: permissionDenied(
        "No autorizado para acceder al panel de repartidor.",
      ),
    };
  }

  const allowed = canUserPerformAction(auth.access, permission, {
    driverUserId: driverUserId ?? auth.access.userId,
  });

  if (!allowed) {
    return {
      ok: false as const,
      response: permissionDenied(deniedMessage),
    };
  }

  return {
    ok: true as const,
    access: auth.access,
    deliveryAccess,
  };
}
