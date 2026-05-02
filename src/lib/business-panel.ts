import type {
  Pool,
  PoolConnection,
  ResultSetHeader,
  RowDataPacket,
} from "mysql2/promise";

import { isAdminGeneral } from "@/lib/admin-security";
import pool from "@/lib/db";
import { buildUserAvatarSelect, getUserAvatarColumns } from "@/lib/user-avatar";

type Queryable = Pool | PoolConnection;

type UserInfoRow = RowDataPacket & {
  email: string;
  role_name: string | null;
};

type AssignedBusinessRow = RowDataPacket & {
  id: number;
  name: string;
  city: string | null;
  source: string;
};

type CourierAvailabilityRow = RowDataPacket & {
  id: number;
  name: string | null;
  email: string | null;
  phone: string | null;
  profile_image_url: string | null;
  active_assignments: number | string | null;
  last_assigned_at: string | null;
};

type CourierRoleRow = RowDataPacket & {
  id: number;
  role_name: string;
};

type TableExistsRow = RowDataPacket & {
  table_name: string;
};

type ColumnExistsRow = RowDataPacket & {
  column_name: string;
};

type CourierDebug = {
  rolesEncontrados: string[];
  usuariosRepartidores: Array<{
    id: number;
    name: string;
    email: string | null;
    phone?: string | null;
    avatarUrl?: string | null;
    roleName: string;
    activeAssignments?: number;
  }>;
  perfilesRepartidor: {
    tableName: string | null;
    hasStatus: boolean;
    hasIsAvailable: boolean;
    hasIsActive: boolean;
    rows: Array<Record<string, unknown>>;
  };
  repartidoresDisponibles?: Array<{
    id: number;
    name: string;
    activeAssignments: number;
  }>;
  repartidoresConCupo?: Array<{
    id: number;
    name: string;
    activeAssignments: number;
  }>;
  maxActiveDeliveries?: number;
};

export type BusinessAccessContext = {
  userId: number;
  email: string | null;
  roles: string[];
  businessId: number | null;
  businessIds: number[];
  isAdmin: boolean;
};

export type AvailableCourierResult = {
  courier: {
    id: number;
    name: string;
    email: string | null;
    phone: string | null;
    avatarUrl: string | null;
    activeAssignments: number;
  } | null;
  availableCouriers: Array<{
    id: number;
    name: string;
    email: string | null;
    phone: string | null;
    avatarUrl: string | null;
    activeAssignments: number;
  }>;
  debug: CourierDebug;
};

const MAX_ACTIVE_DELIVERIES_PER_COURIER = 5;
const ACTIVE_DELIVERY_STATUS_NAMES = [
  "pendiente",
  "pendiente_aceptacion",
  "aceptado",
  "en_camino",
  "repartidor_asignado",
] as const;

export async function resolveBusinessAccess(
  userId: number,
  requestedBusinessId?: number | null,
): Promise<BusinessAccessContext> {
  const [userInfoRows] = await pool.query<UserInfoRow[]>(
    `
      SELECT u.email, r.name AS role_name
      FROM users u
      LEFT JOIN user_roles ur ON ur.user_id = u.id
      LEFT JOIN roles r ON r.id = ur.role_id
      WHERE u.id = ?
    `,
    [userId],
  );

  const email = userInfoRows[0]?.email ?? null;
  const roles = userInfoRows
    .map((row) => row.role_name)
    .filter(Boolean) as string[];

  const [ownerBusinesses] = await pool.query<AssignedBusinessRow[]>(
    `
      SELECT b.id, b.name, b.city, 'owner' AS source
      FROM business_owners bo
      INNER JOIN business b ON b.id = bo.business_id
      WHERE bo.user_id = ?
      ORDER BY b.name ASC
    `,
    [userId],
  );

  const [managerBusinesses] = await pool.query<AssignedBusinessRow[]>(
    `
      SELECT b.id, b.name, b.city, 'manager' AS source
      FROM business_managers bm
      INNER JOIN business b ON b.id = bm.business_id
      WHERE bm.user_id = ? AND COALESCE(bm.is_active, 1) = 1
      ORDER BY b.name ASC
    `,
    [userId],
  );

  const userIsAdminGeneral = await isAdminGeneral(userId);
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

  const businessIds = assignedBusinesses.map((business) => Number(business.id));
  const businessId =
    requestedBusinessId && businessIds.includes(requestedBusinessId)
      ? requestedBusinessId
      : (businessIds[0] ?? null);

  return {
    userId,
    email,
    roles,
    businessId,
    businessIds,
    isAdmin: userIsAdminGeneral,
  };
}

export async function ensureOrderStatus(
  statusName: string,
  description?: string,
  sortOrder = 1,
  isFinal = false,
  executor: Queryable = pool,
) {
  const normalized = statusName.trim().toLowerCase().replace(/\s+/g, "_");
  const [rows] = await executor.query<RowDataPacket[]>(
    `
      SELECT id
      FROM order_status_catalog
      WHERE name = ?
      LIMIT 1
    `,
    [normalized],
  );

  if (rows[0]?.id) {
    return Number(rows[0].id);
  }

  const [result] = await executor.query<ResultSetHeader>(
    `
      INSERT INTO order_status_catalog (
        name,
        description,
        sort_order,
        is_final,
        created_at,
        updated_at
      )
      VALUES (?, ?, ?, ?, NOW(), NOW())
    `,
    [
      normalized,
      description ?? `Estado ${normalized}`,
      sortOrder,
      isFinal ? 1 : 0,
    ],
  );

  return Number(result.insertId);
}

export async function ensureDeliveryStatus(
  statusName: string,
  description?: string,
  sortOrder = 1,
  isFinal = false,
  executor: Queryable = pool,
) {
  const normalized = statusName.trim().toLowerCase().replace(/\s+/g, "_");
  const [rows] = await executor.query<RowDataPacket[]>(
    `
      SELECT id
      FROM delivery_status_catalog
      WHERE name = ?
      LIMIT 1
    `,
    [normalized],
  );

  if (rows[0]?.id) {
    return Number(rows[0].id);
  }

  const [result] = await executor.query<ResultSetHeader>(
    `
      INSERT INTO delivery_status_catalog (
        name,
        description,
        sort_order,
        is_final,
        created_at,
        updated_at
      )
      VALUES (?, ?, ?, ?, NOW(), NOW())
    `,
    [
      normalized,
      description ?? `Estado ${normalized}`,
      sortOrder,
      isFinal ? 1 : 0,
    ],
  );

  return Number(result.insertId);
}

export async function findAvailableCourier(
  executor: Queryable = pool,
  excludedCourierIds: number[] = [],
): Promise<AvailableCourierResult> {
  const avatarColumns = await getUserAvatarColumns(executor);
  const avatarSelect = buildUserAvatarSelect("u", avatarColumns);
  const roleNames = ["repartidor", "delivery", "driver"];
  const excludedPlaceholders = excludedCourierIds.length
    ? `AND u.id NOT IN (${excludedCourierIds.map(() => "?").join(", ")})`
    : "";

  const [roleRows] = await executor.query<CourierRoleRow[]>(
    `
      SELECT id, name AS role_name
      FROM roles
      WHERE LOWER(name) IN (?, ?, ?)
      ORDER BY id ASC
    `,
    roleNames,
  );

  const rolesEncontrados = roleRows.map((row) => String(row.role_name));

  const [courierUserRows] = await executor.query<
    (CourierAvailabilityRow & { role_name: string })[]
  >(
    `
      SELECT
        u.id,
        TRIM(CONCAT_WS(' ', u.first_name, u.last_name)) AS name,
        u.email,
        u.phone,
        ${avatarSelect},
        r.name AS role_name,
        (
          SELECT COUNT(*)
          FROM delivery d
          LEFT JOIN delivery_status_catalog dsc ON dsc.id = d.delivery_status_id
          WHERE d.driver_user_id = u.id
            AND LOWER(
              REPLACE(
                REPLACE(
                  REPLACE(
                    REPLACE(COALESCE(dsc.name, ''), 'á', 'a'),
                    'é',
                    'e'
                  ),
                  'í',
                  'i'
                ),
                ' ',
                '_'
              )
            ) IN (?, ?, ?, ?, ?)
        ) AS active_assignments,
        (
          SELECT MAX(COALESCE(d.assigned_at, d.created_at))
          FROM delivery d
          WHERE d.driver_user_id = u.id
        ) AS last_assigned_at
      FROM users u
      INNER JOIN user_roles ur ON ur.user_id = u.id
      INNER JOIN roles r ON r.id = ur.role_id
      WHERE LOWER(r.name) IN (?, ?, ?)
        AND COALESCE(u.status_id, 0) = 1
        ${excludedPlaceholders}
      ORDER BY active_assignments ASC, last_assigned_at ASC, u.id ASC
    `,
    [...ACTIVE_DELIVERY_STATUS_NAMES, ...roleNames, ...excludedCourierIds],
  );

  const usuariosRepartidores = courierUserRows.map((row) => ({
    id: Number(row.id),
    name: row.name ?? "Repartidor sin nombre",
    email: row.email ?? null,
    roleName: String(row.role_name),
    activeAssignments: Number(row.active_assignments ?? 0),
  }));

  const [profileTableRows] = await executor.query<TableExistsRow[]>(
    `
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = DATABASE()
        AND table_name IN ('delivery_profiles', 'driver_profiles')
      ORDER BY FIELD(table_name, 'delivery_profiles', 'driver_profiles')
    `,
  );

  const profileTableName = profileTableRows[0]?.table_name ?? null;
  let hasStatus = false;
  let hasIsAvailable = false;
  let hasIsActive = false;
  let filteredCourierIds = new Set<number>(
    courierUserRows.map((row) => Number(row.id)),
  );
  let profileDebugRows: Array<Record<string, unknown>> = [];

  if (profileTableName) {
    const [columnRows] = await executor.query<ColumnExistsRow[]>(
      `
        SELECT column_name
        FROM information_schema.columns
        WHERE table_schema = DATABASE()
          AND table_name = ?
          AND column_name IN ('status', 'is_available', 'is_active')
      `,
      [profileTableName],
    );

    const columnNames = new Set(
      columnRows.map((row) => String(row.column_name).toLowerCase()),
    );
    hasStatus = columnNames.has("status");
    hasIsAvailable = columnNames.has("is_available");
    hasIsActive = columnNames.has("is_active");

    if (hasStatus || hasIsAvailable || hasIsActive) {
      const selectFields = ["user_id"];
      if (hasStatus) selectFields.push("status");
      if (hasIsAvailable) selectFields.push("is_available");
      if (hasIsActive) selectFields.push("is_active");

      const [profileRows] = await executor.query<RowDataPacket[]>(
        `
          SELECT ${selectFields.join(", ")}
          FROM ${profileTableName}
        `,
      );

      profileDebugRows = profileRows.map((row) => ({
        user_id: Number(row.user_id),
        ...(hasStatus ? { status: row.status } : {}),
        ...(hasIsAvailable ? { is_available: row.is_available } : {}),
        ...(hasIsActive ? { is_active: row.is_active } : {}),
      }));

      const availableProfileUserIds = profileRows
        .filter((row) => {
          const statusOk = hasStatus
            ? ["activo", "active", "disponible", "available"].includes(
                String(row.status ?? "")
                  .trim()
                  .toLowerCase(),
              )
            : false;
          const availableOk = hasIsAvailable
            ? Boolean(row.is_available)
            : false;
          const activeOk = hasIsActive ? Boolean(row.is_active) : false;

          return statusOk || availableOk || activeOk;
        })
        .map((row) => Number(row.user_id))
        .filter((userId) => Number.isInteger(userId) && userId > 0);

      filteredCourierIds = new Set(availableProfileUserIds);
    }
  }

  const filteredAvailableCouriers = courierUserRows.filter((row) =>
    filteredCourierIds.has(Number(row.id)),
  );
  const couriersWithCapacity = filteredAvailableCouriers.filter(
    (row) =>
      Number(row.active_assignments ?? 0) < MAX_ACTIVE_DELIVERIES_PER_COURIER,
  );

  const debug: CourierDebug = {
    rolesEncontrados,
    usuariosRepartidores,
    perfilesRepartidor: {
      tableName: profileTableName,
      hasStatus,
      hasIsAvailable,
      hasIsActive,
      rows: profileDebugRows,
    },
    repartidoresDisponibles: filteredAvailableCouriers.map((row) => ({
      id: Number(row.id),
      name: row.name ?? "Repartidor sin nombre",
      activeAssignments: Number(row.active_assignments ?? 0),
    })),
    repartidoresConCupo: couriersWithCapacity.map((row) => ({
      id: Number(row.id),
      name: row.name ?? "Repartidor sin nombre",
      activeAssignments: Number(row.active_assignments ?? 0),
    })),
    maxActiveDeliveries: MAX_ACTIVE_DELIVERIES_PER_COURIER,
  };

  console.log("[courier-search] roles encontrados:", rolesEncontrados);
  console.log(
    "[courier-search] usuarios con rol repartidor:",
    usuariosRepartidores,
  );
  console.log(
    "[courier-search] repartidores disponibles:",
    filteredAvailableCouriers.map((row) => ({
      id: Number(row.id),
      name: row.name ?? "Repartidor sin nombre",
      email: row.email ?? null,
      phone: row.phone ?? null,
      avatarUrl: row.profile_image_url ?? null,
      roleName: String(
        (row as CourierAvailabilityRow & { role_name: string }).role_name,
      ),
      activeAssignments: Number(row.active_assignments ?? 0),
    })),
  );
  console.log(
    "[courier-search] repartidores con cupo:",
    couriersWithCapacity.map((row) => ({
      id: Number(row.id),
      name: row.name ?? "Repartidor sin nombre",
      activeAssignments: Number(row.active_assignments ?? 0),
    })),
  );

  const selectedCourier = couriersWithCapacity[0]
    ? {
        id: Number(couriersWithCapacity[0].id),
        name: couriersWithCapacity[0].name ?? "Repartidor sin nombre",
        email: couriersWithCapacity[0].email ?? null,
        phone: couriersWithCapacity[0].phone ?? null,
        avatarUrl: couriersWithCapacity[0].profile_image_url ?? null,
        activeAssignments: Number(
          couriersWithCapacity[0].active_assignments ?? 0,
        ),
      }
    : null;

  const availableCouriers = couriersWithCapacity.map((row) => ({
    id: Number(row.id),
    name: row.name ?? "Repartidor sin nombre",
    email: row.email ?? null,
    phone: row.phone ?? null,
    avatarUrl: row.profile_image_url ?? null,
    activeAssignments: Number(row.active_assignments ?? 0),
  }));

  console.log("[courier-search] repartidor seleccionado:", selectedCourier);

  return {
    courier: selectedCourier,
    availableCouriers,
    debug,
  };
}
