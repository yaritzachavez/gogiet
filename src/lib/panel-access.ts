export type PanelKey = "admin" | "delivery" | "business" | "seller";

const ROLE_ALIASES: Record<string, string> = {
  ADMIN: "ADMIN_GENERAL",
  ADMIN_GENERAL: "ADMIN_GENERAL",
  admin_general: "ADMIN_GENERAL",
  DELIVERY: "REPARTIDOR",
  DRIVER: "REPARTIDOR",
  REPARTIDOR: "REPARTIDOR",
  repartidor: "REPARTIDOR",
  BUSINESS_ADMIN: "ADMIN_NEGOCIO",
  BUSINESS_OWNER: "ADMIN_NEGOCIO",
  ADMIN_NEGOCIO: "ADMIN_NEGOCIO",
  DUENO_TIENDA: "ADMIN_NEGOCIO",
  business_admin: "ADMIN_NEGOCIO",
  BUSINESS_MANAGER: "VENDEDOR",
  SELLER: "VENDEDOR",
  VENDOR: "VENDEDOR",
  VENDEDOR: "VENDEDOR",
  business_staff: "VENDEDOR",
  CLIENTE: "CLIENTE",
  cliente: "CLIENTE",
};

export function normalizePanelRoles(roles: unknown): string[] {
  const roleList = Array.isArray(roles) ? roles : roles ? [roles] : [];

  return Array.from(
    new Set(
      roleList
        .map((role) => ROLE_ALIASES[String(role).trim()])
        .filter((role): role is string => Boolean(role)),
    ),
  );
}

export function canAccessPanel(roles: unknown, panel: PanelKey) {
  const normalizedRoles = normalizePanelRoles(roles);

  if (normalizedRoles.includes("ADMIN_GENERAL")) {
    return panel === "admin";
  }

  if (panel === "delivery") {
    return normalizedRoles.includes("REPARTIDOR");
  }

  if (panel === "business") {
    return normalizedRoles.includes("ADMIN_NEGOCIO");
  }

  if (panel === "seller") {
    return normalizedRoles.includes("VENDEDOR");
  }

  return false;
}
