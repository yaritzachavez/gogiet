import type { RowDataPacket } from "mysql2/promise";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { getAuthUser } from "@/lib/admin-security";
import { isSessionTokenActive, touchSessionToken } from "@/lib/auth-security";
import { getActiveAuthStatusId } from "@/lib/auth-users";
import { resolveBusinessAccess } from "@/lib/business-panel";
import pool from "@/lib/db";
import { resolveDeliveryAccess } from "@/lib/delivery-access";
import { getRequestLoggerContext, logger } from "@/lib/logger";
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
  status_id: number | null;
  role_name: string | null;
};

type PermissionResource = {
  businessId?: number | null;
  customerUserId?: number | null;
  driverUserId?: number | null;
  assignedBusinessIds?: number[];
};

type OrderOwnershipRow = RowDataPacket & {
  id: number;
  user_id: number;
  business_id: number;
  driver_user_id: number | null;
};

type PaymentOwnershipRow = RowDataPacket & {
  id: number;
  order_id: number;
  user_id: number;
  business_id: number;
  driver_user_id: number | null;
};

function authError(message: string, status: 401 | 403) {
  return NextResponse.json({ success: false, error: message }, { status });
}

function permissionDenied(message: string) {
  return authError(message, 403);
}

function getRequestPath(req: NextRequest) {
  try {
    return new URL(req.url).pathname;
  } catch {
    return req.nextUrl?.pathname ?? "unknown";
  }
}

function logSecurityEvent(params: {
  req: NextRequest;
  reason: string;
  userId?: number | null;
  targetUserId?: number | null;
  businessId?: number | null;
  orderId?: number | null;
  paymentId?: number | null;
}) {
  logger.security("auth.access_denied", "Acceso denegado", {
    ...getRequestLoggerContext(params.req),
    route: getRequestPath(params.req),
    reason: params.reason,
    userId: params.userId ?? null,
    targetUserId: params.targetUserId ?? null,
    businessId: params.businessId ?? null,
    orderId: params.orderId ?? null,
    paymentId: params.paymentId ?? null,
    severity: "high",
  });
}

export async function getPermissionAccessContext(
  req: NextRequest,
): Promise<PermissionAccessContext | null> {
  const auth = getAuthUser(req);

  if (!auth.token || !auth.user) {
    return null;
  }

  const activeSession = await isSessionTokenActive(auth.token);
  if (!activeSession) {
    return null;
  }

  await touchSessionToken(auth.token);

  const [rows] = await pool.query<UserRoleRow[]>(
    `
      SELECT u.email, u.status_id, r.name AS role_name
      FROM users u
      LEFT JOIN user_roles ur ON ur.user_id = u.id
      LEFT JOIN roles r ON r.id = ur.role_id
      WHERE u.id = ?
    `,
    [auth.user.id],
  );

  const activeStatusId = await getActiveAuthStatusId();
  const statusId = Number(rows[0]?.status_id ?? 0);
  if (!rows.length || statusId !== activeStatusId) {
    return null;
  }

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

export async function requireAuthenticatedUser(req: NextRequest) {
  const access = await getPermissionAccessContext(req);

  if (!access) {
    logSecurityEvent({ req, reason: "missing_or_invalid_auth" });
    return {
      ok: false as const,
      response: authError("Necesitas iniciar sesión para continuar.", 401),
    };
  }

  return { ok: true as const, access };
}

export const requireAuth = requireAuthenticatedUser;

export function canUserPerformAction(
  access: PermissionAccessContext,
  permission: Permission,
  resource?: PermissionResource,
) {
  const allowedRoles = PERMISSIONS[permission] as readonly PublicRoleName[];
  const hasGlobalRole = access.roles.some((role) =>
    allowedRoles.includes(role),
  );

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
    return (
      access.roles.includes("ADMIN_GENERAL") || driverUserId === access.userId
    );
  }

  return true;
}

export async function requirePermission(
  req: NextRequest,
  permission: Permission,
  resource?: PermissionResource,
  deniedMessage = "No tienes permiso para realizar esta acción.",
) {
  const auth = await requireAuthenticatedUser(req);
  if (!auth.ok) return auth;

  if (!canUserPerformAction(auth.access, permission, resource)) {
    logSecurityEvent({
      req,
      reason: `missing_permission:${permission}`,
      userId: auth.access.userId,
      businessId: resource?.businessId ?? null,
      orderId: null,
      paymentId: null,
    });
    return {
      ok: false as const,
      response: permissionDenied(deniedMessage),
    };
  }

  return { ok: true as const, access: auth.access };
}

export async function requireAdminGeneral(req: NextRequest) {
  const auth = await requirePermission(
    req,
    "MANAGE_GLOBAL_ROLES",
    undefined,
    "Solo el administrador general puede realizar esta acción.",
  );

  if (!auth.ok) {
    return auth;
  }

  return auth;
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
  const auth = await requireAuthenticatedUser(req);
  if (!auth.ok) return auth;

  const businessAccess = await resolveBusinessAccess(
    auth.access.userId,
    businessId,
  );
  const allowed = canUserPerformAction(auth.access, permission, {
    businessId,
    assignedBusinessIds: businessAccess.businessIds,
  });

  if (!allowed) {
    logSecurityEvent({
      req,
      reason: `cross_business_access:${permission}`,
      userId: auth.access.userId,
      businessId,
    });
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

export async function requireSellerAccess(
  req: NextRequest,
  businessId?: number | null,
  deniedMessage = "No tienes permisos de vendedor o negocio para esta acción.",
) {
  const auth = await requireAuthenticatedUser(req);
  if (!auth.ok) return auth;

  const businessAccess = await resolveBusinessAccess(
    auth.access.userId,
    businessId ?? null,
  );
  const hasSellerRole =
    auth.access.roles.includes("VENDEDOR") ||
    auth.access.roles.includes("ADMIN_NEGOCIO") ||
    auth.access.roles.includes("ADMIN_GENERAL");

  const hasBusinessScope =
    auth.access.roles.includes("ADMIN_GENERAL") ||
    businessAccess.businessIds.length > 0;

  if (!hasSellerRole || !hasBusinessScope) {
    logSecurityEvent({
      req,
      reason: "missing_seller_scope",
      userId: auth.access.userId,
      businessId: businessId ?? businessAccess.businessId,
    });
    return {
      ok: false as const,
      response: permissionDenied(deniedMessage),
    };
  }

  if (
    businessId &&
    !auth.access.roles.includes("ADMIN_GENERAL") &&
    !businessAccess.businessIds.includes(businessId)
  ) {
    logSecurityEvent({
      req,
      reason: "seller_cross_business_access",
      userId: auth.access.userId,
      businessId,
    });
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
  permission:
    | "ACCEPT_DELIVERY"
    | "VIEW_ASSIGNED_DELIVERIES" = "VIEW_ASSIGNED_DELIVERIES",
  deniedMessage = "No puedes modificar pedidos de otro repartidor.",
) {
  const auth = await requireAuthenticatedUser(req);
  if (!auth.ok) return auth;

  const deliveryAccess = await resolveDeliveryAccess(auth.access.userId);

  if (!deliveryAccess.allowed) {
    logSecurityEvent({
      req,
      reason: "missing_driver_scope",
      userId: auth.access.userId,
    });
    return {
      ok: false as const,
      response: permissionDenied(
        "No autorizado para acceder al panel de repartidor.",
      ),
    };
  }

  if (permission === "ACCEPT_DELIVERY" && !deliveryAccess.canOperate) {
    logSecurityEvent({
      req,
      reason: `driver_not_operational:${deliveryAccess.operationalStatus}`,
      userId: auth.access.userId,
    });
    return {
      ok: false as const,
      response: permissionDenied(
        "Tu estado operativo no permite aceptar o actualizar entregas.",
      ),
    };
  }

  const allowed = canUserPerformAction(auth.access, permission, {
    driverUserId: driverUserId ?? auth.access.userId,
  });

  if (!allowed) {
    logSecurityEvent({
      req,
      reason: `driver_cross_assignment:${permission}`,
      userId: auth.access.userId,
      targetUserId: driverUserId ?? null,
    });
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

export async function requireSelfOrAdmin(
  req: NextRequest,
  targetUserId: number,
  deniedMessage = "No puedes acceder a los datos de otro usuario.",
) {
  const auth = await requireAuthenticatedUser(req);
  if (!auth.ok) return auth;

  const allowed =
    auth.access.userId === targetUserId ||
    auth.access.roles.includes("ADMIN_GENERAL");

  if (!allowed) {
    logSecurityEvent({
      req,
      reason: "cross_user_access",
      userId: auth.access.userId,
      targetUserId,
    });
    return {
      ok: false as const,
      response: permissionDenied(deniedMessage),
    };
  }

  return { ok: true as const, access: auth.access };
}

export async function requireOrderOwnership(
  req: NextRequest,
  orderId: number,
  deniedMessage = "No autorizado para acceder a este pedido.",
) {
  const auth = await requireAuthenticatedUser(req);
  if (!auth.ok) return auth;

  const [rows] = await pool.query<OrderOwnershipRow[]>(
    `
      SELECT
        o.id,
        o.user_id,
        o.business_id,
        d.driver_user_id
      FROM orders o
      LEFT JOIN delivery d ON d.order_id = o.id
      WHERE o.id = ?
      LIMIT 1
    `,
    [orderId],
  );

  const order = rows[0];
  if (!order) {
    return {
      ok: false as const,
      response: NextResponse.json(
        { success: false, error: "Pedido no encontrado." },
        { status: 404 },
      ),
    };
  }

  const businessAccess = await resolveBusinessAccess(
    auth.access.userId,
    Number(order.business_id),
  );
  const deliveryAccess = await resolveDeliveryAccess(auth.access.userId);

  const allowed =
    auth.access.roles.includes("ADMIN_GENERAL") ||
    Number(order.user_id) === auth.access.userId ||
    businessAccess.businessIds.includes(Number(order.business_id)) ||
    (deliveryAccess.allowed &&
      Number(order.driver_user_id ?? 0) === auth.access.userId);

  if (!allowed) {
    logSecurityEvent({
      req,
      reason: "cross_order_access",
      userId: auth.access.userId,
      orderId,
      businessId: Number(order.business_id),
    });
    return {
      ok: false as const,
      response: permissionDenied(deniedMessage),
    };
  }

  return {
    ok: true as const,
    access: auth.access,
    order,
    businessAccess,
    deliveryAccess,
  };
}

export async function requirePaymentOwnership(
  req: NextRequest,
  paymentId: number,
  deniedMessage = "No autorizado para acceder a este pago.",
) {
  const auth = await requireAuthenticatedUser(req);
  if (!auth.ok) return auth;

  const [rows] = await pool.query<PaymentOwnershipRow[]>(
    `
      SELECT
        p.id,
        p.order_id,
        o.user_id,
        o.business_id,
        d.driver_user_id
      FROM payments p
      INNER JOIN orders o ON o.id = p.order_id
      LEFT JOIN delivery d ON d.order_id = o.id
      WHERE p.id = ?
      LIMIT 1
    `,
    [paymentId],
  );

  const payment = rows[0];
  if (!payment) {
    return {
      ok: false as const,
      response: NextResponse.json(
        { success: false, error: "Pago no encontrado." },
        { status: 404 },
      ),
    };
  }

  const businessAccess = await resolveBusinessAccess(
    auth.access.userId,
    Number(payment.business_id),
  );
  const deliveryAccess = await resolveDeliveryAccess(auth.access.userId);

  const allowed =
    auth.access.roles.includes("ADMIN_GENERAL") ||
    Number(payment.user_id) === auth.access.userId ||
    businessAccess.businessIds.includes(Number(payment.business_id)) ||
    (deliveryAccess.allowed &&
      Number(payment.driver_user_id ?? 0) === auth.access.userId);

  if (!allowed) {
    logSecurityEvent({
      req,
      reason: "cross_payment_access",
      userId: auth.access.userId,
      orderId: Number(payment.order_id),
      paymentId,
      businessId: Number(payment.business_id),
    });
    return {
      ok: false as const,
      response: permissionDenied(deniedMessage),
    };
  }

  return {
    ok: true as const,
    access: auth.access,
    payment,
    businessAccess,
    deliveryAccess,
  };
}
