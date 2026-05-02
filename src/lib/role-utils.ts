export const DB_ROLE_NAMES = [
  "admin_general",
  "cliente",
  "repartidor",
  "business_admin",
  "business_staff",
] as const;

export type DbRoleName = (typeof DB_ROLE_NAMES)[number];

export const PUBLIC_ROLE_NAMES = [
  "ADMIN_GENERAL",
  "CLIENTE",
  "REPARTIDOR",
  "ADMIN_NEGOCIO",
  "VENDEDOR",
] as const;

export type PublicRoleName = (typeof PUBLIC_ROLE_NAMES)[number];

const DB_TO_PUBLIC_ROLE_MAP: Record<DbRoleName, PublicRoleName> = {
  admin_general: "ADMIN_GENERAL",
  cliente: "CLIENTE",
  repartidor: "REPARTIDOR",
  business_admin: "ADMIN_NEGOCIO",
  business_staff: "VENDEDOR",
};

const PUBLIC_TO_DB_ROLE_MAP: Record<PublicRoleName, DbRoleName> = {
  ADMIN_GENERAL: "admin_general",
  CLIENTE: "cliente",
  REPARTIDOR: "repartidor",
  ADMIN_NEGOCIO: "business_admin",
  VENDEDOR: "business_staff",
};

const ROLE_ALIASES: Record<string, DbRoleName> = {
  ADMIN_GENERAL: "admin_general",
  admin_general: "admin_general",
  CLIENTE: "cliente",
  cliente: "cliente",
  REPARTIDOR: "repartidor",
  repartidor: "repartidor",
  VENDEDOR: "business_staff",
  business_staff: "business_staff",
  ADMIN_NEGOCIO: "business_admin",
  DUENO_TIENDA: "business_admin",
  business_admin: "business_admin",
};

export function mapDbRoleToPublicRole(role: string): PublicRoleName | null {
  if (!role) return null;

  return DB_TO_PUBLIC_ROLE_MAP[role as DbRoleName] ?? null;
}

export function mapDbRolesToPublicRoles(roles: string[] | undefined | null) {
  if (!Array.isArray(roles)) return [];

  return Array.from(
    new Set(
      roles
        .map((role) => mapDbRoleToPublicRole(String(role)))
        .filter((role): role is PublicRoleName => Boolean(role)),
    ),
  );
}

export function normalizeRoleInput(value: unknown): DbRoleName | null {
  const normalized = String(value ?? "").trim();
  if (!normalized) return null;

  return ROLE_ALIASES[normalized] ?? null;
}

export function normalizeRoleInputs(values: unknown): DbRoleName[] {
  if (!Array.isArray(values)) {
    const single = normalizeRoleInput(values);
    return single ? [single] : [];
  }

  return Array.from(
    new Set(
      values
        .map((value) => normalizeRoleInput(value))
        .filter((role): role is DbRoleName => Boolean(role)),
    ),
  );
}

export function mapPublicRoleToDbRole(role: PublicRoleName): DbRoleName {
  return PUBLIC_TO_DB_ROLE_MAP[role];
}
