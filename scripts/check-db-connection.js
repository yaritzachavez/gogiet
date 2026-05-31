require("dotenv").config({ path: ".env.local" });
require("dotenv").config({ path: ".env" });

const mysql = require("mysql2/promise");
const { prisma } = require("./prisma-runtime");

function maskUrl(value) {
  if (!value) return null;

  try {
    const parsed = new URL(value);
    const username = parsed.username
      ? `${decodeURIComponent(parsed.username).slice(0, 2)}***`
      : "";
    const database = parsed.pathname.replace(/^\//, "");

    return `${parsed.protocol}//${username}:***@${parsed.hostname}${
      parsed.port ? `:${parsed.port}` : ""
    }/${database}${parsed.search}`;
  } catch {
    return "[invalid DATABASE_URL]";
  }
}

async function main() {
  let databaseUrlHost = null;
  try {
    databaseUrlHost = process.env.DATABASE_URL
      ? new URL(process.env.DATABASE_URL).hostname
      : null;
  } catch {}

  console.log("[db-check] env summary", {
    databaseUrlExists: Boolean(process.env.DATABASE_URL),
    databaseUrlMasked: maskUrl(process.env.DATABASE_URL),
    databaseUrlHost,
    dbHost: process.env.DB_HOST || null,
    dbPort: process.env.DB_PORT || null,
    dbName: process.env.DB_NAME || null,
    dbUser: process.env.DB_USER
      ? `${process.env.DB_USER.slice(0, 2)}***`
      : null,
    dbSslCaExists: Boolean(process.env.DB_SSL_CA || process.env.DB_CA),
    nodeEnv: process.env.NODE_ENV || "development",
    preferredSource: process.env.DATABASE_URL ? "DATABASE_URL" : "DB_*",
    hostMismatch:
      Boolean(databaseUrlHost) &&
      Boolean(process.env.DB_HOST) &&
      databaseUrlHost !== process.env.DB_HOST,
  });

  try {
    await prisma.$connect();
    await prisma.$queryRaw`SELECT 1`;
    console.log("[db-check] prisma connection ok");
  } catch (error) {
    console.error("[db-check] prisma connection failed", {
      message: error instanceof Error ? error.message : String(error),
      code: error && typeof error === "object" ? error.code : undefined,
    });
  } finally {
    await prisma.$disconnect().catch(() => {});
  }

  if (!process.env.DATABASE_URL) {
    console.warn(
      "[db-check] skipping mysql2 manual test: DATABASE_URL missing",
    );
    return;
  }

  let connection;

  try {
    const url = new URL(process.env.DATABASE_URL);
    url.searchParams.delete("ssl-mode");
    connection = await mysql.createConnection(url.toString());
    await connection.query("SELECT 1");
    console.log("[db-check] mysql2 connection ok");
  } catch (error) {
    console.error("[db-check] mysql2 connection failed", {
      message: error instanceof Error ? error.message : String(error),
      code: error && typeof error === "object" ? error.code : undefined,
      errno: error && typeof error === "object" ? error.errno : undefined,
    });
  } finally {
    if (connection) {
      await connection.end().catch(() => {});
    }
  }
}

main().catch((error) => {
  console.error("[db-check] fatal", {
    message: error instanceof Error ? error.message : String(error),
  });
  process.exitCode = 1;
});
