import { PrismaClient, type Prisma } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
};

function resolvePrismaDatabaseUrl() {
  const existingUrl = process.env.DATABASE_URL?.trim();

  if (existingUrl) {
    return existingUrl;
  }

  const host = process.env.DB_HOST?.trim();
  const user = process.env.DB_USER?.trim();
  const password = process.env.DB_PASSWORD ?? process.env.DB_PASS ?? "";
  const database = process.env.DB_NAME?.trim();
  const port = process.env.DB_PORT?.trim();

  if (!host || !user || !database) {
    return null;
  }

  const encodedUser = encodeURIComponent(user);
  const encodedPassword = encodeURIComponent(password);
  const encodedDatabase = encodeURIComponent(database);
  const hostWithPort = port ? `${host}:${port}` : host;
  const needsSsl =
    host.includes("aivencloud.com") ||
    process.env.DB_SSL_CA ||
    process.env.DB_CA ||
    process.env.DB_REQUIRE_SSL === "true";

  const query = needsSsl ? "?ssl-mode=REQUIRED" : "";

  const url = `mysql://${encodedUser}:${encodedPassword}@${hostWithPort}/${encodedDatabase}${query}`;
  process.env.DATABASE_URL = url;

  console.info("[prisma] DATABASE_URL generado desde DB_*", {
    host,
    database,
    port: port ?? "(default)",
    needsSsl,
  });

  return url;
}

resolvePrismaDatabaseUrl();

const prismaClientOptions: Prisma.PrismaClientOptions = {
  log: ["query", "info", "warn", "error"],
};

export const prisma =
  globalForPrisma.prisma ?? new PrismaClient(prismaClientOptions);

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
