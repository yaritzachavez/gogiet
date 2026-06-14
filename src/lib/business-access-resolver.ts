export type BusinessAccessSource =
  | "owner"
  | "owner_repaired"
  | "manager"
  | "admin_general";

type UserInfoRow = {
  email: string;
  role_name: string | null;
};

type AssignedBusiness = {
  id: number;
  name: string;
  city: string | null;
  source: BusinessAccessSource;
};

export type BusinessAccessContext = {
  userId: number;
  email: string | null;
  roles: string[];
  businessId: number | null;
  businessIds: number[];
  businesses: Array<{
    id: number;
    name: string;
    city: string | null;
    source: BusinessAccessSource;
  }>;
  selectedBusinessSource: BusinessAccessSource | null;
  requestedBusinessId: number | null;
  denialReason: "not_assigned" | "requested_business_forbidden" | null;
  isAdmin: boolean;
};

export type BusinessAccessDependencies = {
  getExistingTables: (names: string[]) => Promise<Set<string>>;
  query: (sql: string, params?: Array<number | string>) => Promise<[unknown[]]>;
  findExistingBusinessIds: (ids: number[]) => Promise<number[]>;
  isAdminGeneral: (userId: number) => Promise<boolean>;
};

export function createResolveBusinessAccess(
  dependencies: BusinessAccessDependencies,
) {
  return async function resolveBusinessAccess(
    userId: number,
    requestedBusinessId?: number | null,
  ): Promise<BusinessAccessContext> {
    const existingTables = await dependencies.getExistingTables([
      "users",
      "user_roles",
      "roles",
      "business_owners",
      "business_managers",
      "business",
      "businesses",
    ]);
    const hasUsersTable = existingTables.has("users");
    const hasRolesTables =
      existingTables.has("user_roles") && existingTables.has("roles");
    const hasBusinessTable =
      existingTables.has("business") || existingTables.has("businesses");

    let userInfoRows: UserInfoRow[] = [];

    if (hasUsersTable && hasRolesTables) {
      [userInfoRows] = (await dependencies.query(
        `
          SELECT u.email, r.name AS role_name
          FROM users u
          LEFT JOIN user_roles ur ON ur.user_id = u.id
          LEFT JOIN roles r ON r.id = ur.role_id
          WHERE u.id = ?
        `,
        [userId],
      )) as [UserInfoRow[]];
    } else if (hasUsersTable) {
      [userInfoRows] = (await dependencies.query(
        `
          SELECT u.email, NULL AS role_name
          FROM users u
          WHERE u.id = ?
        `,
        [userId],
      )) as [UserInfoRow[]];
    }

    const email = userInfoRows[0]?.email ?? null;
    const roles = userInfoRows
      .map((row) => row.role_name)
      .filter(Boolean) as string[];

    const ownerBusinesses: AssignedBusiness[] =
      existingTables.has("business_owners") && hasBusinessTable
        ? ((
            await dependencies.query(
              `
                SELECT b.id, b.name, b.city, 'owner' AS source
                FROM business_owners bo
                INNER JOIN business b ON b.id = bo.business_id
                WHERE bo.user_id = ?
                ORDER BY b.name ASC
              `,
              [userId],
            )
          )[0] as AssignedBusiness[])
        : [];

    const managerBusinesses: AssignedBusiness[] =
      existingTables.has("business_managers") && hasBusinessTable
        ? ((
            await dependencies.query(
              `
                SELECT b.id, b.name, b.city, 'manager' AS source
                FROM business_managers bm
                INNER JOIN business b ON b.id = bm.business_id
                WHERE bm.user_id = ? AND COALESCE(bm.is_active, 1) = 1
                ORDER BY b.name ASC
              `,
              [userId],
            )
          )[0] as AssignedBusiness[])
        : [];

    const userIsAdminGeneral = hasRolesTables
      ? await dependencies.isAdminGeneral(userId)
      : false;
    const assignedBusinessesMap = new Map<number, AssignedBusiness>();

    for (const business of [...ownerBusinesses, ...managerBusinesses]) {
      assignedBusinessesMap.set(Number(business.id), business);
    }

    let assignedBusinesses = Array.from(assignedBusinessesMap.values());

    if (assignedBusinesses.length > 0 && hasBusinessTable) {
      const requestedIds = assignedBusinesses
        .map((business) => Number(business.id))
        .filter((businessId) => Number.isFinite(businessId) && businessId > 0);
      const existingBusinessIds = new Set(
        await dependencies.findExistingBusinessIds(requestedIds),
      );

      assignedBusinesses = assignedBusinesses.filter((business) =>
        existingBusinessIds.has(Number(business.id)),
      );
    }

    if (!assignedBusinesses.length && userIsAdminGeneral && hasBusinessTable) {
      const [adminBusinesses] = (await dependencies.query(
        `
          SELECT b.id, b.name, b.city, 'admin_general' AS source
          FROM business b
          WHERE COALESCE(b.status_id, 1) = 1
          ORDER BY b.name ASC
        `,
      )) as [AssignedBusiness[]];

      assignedBusinesses = adminBusinesses;
    }

    const businessIds = assignedBusinesses.map((business) =>
      Number(business.id),
    );
    let denialReason: "not_assigned" | "requested_business_forbidden" | null =
      null;
    let businessId: number | null = null;

    if (requestedBusinessId) {
      businessId = businessIds.includes(requestedBusinessId)
        ? requestedBusinessId
        : null;
      denialReason = businessId
        ? null
        : assignedBusinesses.length
          ? "requested_business_forbidden"
          : "not_assigned";
    } else {
      businessId = businessIds[0] ?? null;
      denialReason = businessId ? null : "not_assigned";
    }

    const selectedBusinessSource =
      assignedBusinesses.find((business) => Number(business.id) === businessId)
        ?.source ?? null;

    return {
      userId,
      email,
      roles,
      businessId,
      businessIds,
      businesses: assignedBusinesses.map((business) => ({
        id: Number(business.id),
        name: String(business.name),
        city: business.city ?? null,
        source: business.source,
      })),
      selectedBusinessSource,
      requestedBusinessId: requestedBusinessId ?? null,
      denialReason,
      isAdmin: userIsAdminGeneral,
    };
  };
}
