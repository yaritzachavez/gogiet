export const INTERNAL_TOOL_PATH_PREFIXES = [
  "/dev",
  "/debug",
  "/playground",
  "/diagnostics",
  "/api/dev",
  "/api/debug",
  "/api/test",
  "/api/test-email",
  "/api/seed",
  "/api/diagnostics",
  "/api/admin/debug",
] as const;

export function isProductionRuntime() {
  return process.env.NODE_ENV === "production";
}

export function areInternalToolsEnabled() {
  return !isProductionRuntime() && process.env.ENABLE_INTERNAL_TOOLS === "true";
}

export function isInternalToolPath(pathname: string) {
  return INTERNAL_TOOL_PATH_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}
