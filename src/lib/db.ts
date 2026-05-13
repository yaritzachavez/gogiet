import mysql from "mysql2/promise";

import { getDbSslSummary, resolveDbSslCaContent } from "@/lib/db-ssl";

type DbRuntimeConfig = {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
  useSsl: boolean;
};

function getMaskedDatabaseUrl(value?: string | null) {
  if (!value) {
    return null;
  }

  try {
    const parsed = new URL(value);
    const database = parsed.pathname.replace(/^\//, "");
    const username = parsed.username
      ? `${decodeURIComponent(parsed.username).slice(0, 2)}***`
      : "";

    return `${parsed.protocol}//${username}:***@${parsed.hostname}${
      parsed.port ? `:${parsed.port}` : ""
    }/${database}${parsed.search}`;
  } catch {
    return "[invalid DATABASE_URL]";
  }
}

function resolveDbConfig(): DbRuntimeConfig {
  const existingUrl = process.env.DATABASE_URL?.trim();
  let parsedUrl: URL | null = null;

  if (existingUrl) {
    try {
      parsedUrl = new URL(existingUrl);
    } catch (error) {
      console.warn("[db] DATABASE_URL inválida", {
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const host =
    process.env.DB_HOST?.trim() || parsedUrl?.hostname?.trim() || null;
  const database =
    process.env.DB_NAME?.trim() ||
    parsedUrl?.pathname.replace(/^\//, "").trim() ||
    null;
  const portCandidate =
    process.env.DB_PORT?.trim() || parsedUrl?.port?.trim() || "3306";
  const port = Number(portCandidate);
  const user =
    process.env.DB_USER?.trim() ||
    (parsedUrl?.username ? decodeURIComponent(parsedUrl.username) : "") ||
    null;
  const password =
    process.env.DB_PASSWORD ??
    process.env.DB_PASS ??
    (parsedUrl?.password ? decodeURIComponent(parsedUrl.password) : "");

  if (!host || !database || !user) {
    throw new Error(
      "[db] Faltan variables de conexión. Define DATABASE_URL completa o DB_HOST, DB_NAME y DB_USER.",
    );
  }

  const caContent = resolveDbSslCaContent();
  const useSsl =
    host.includes("aivencloud.com") ||
    Boolean(caContent) ||
    process.env.DB_REQUIRE_SSL === "true";

  return {
    host,
    port: Number.isFinite(port) && port > 0 ? port : 3306,
    user,
    password,
    database,
    useSsl,
  };
}

const dbConfig = resolveDbConfig();
const caCertificate = resolveDbSslCaContent();
const dbSslSummary = getDbSslSummary();
const maskedDatabaseUrl = getMaskedDatabaseUrl(process.env.DATABASE_URL);
const sslConfig = caCertificate
  ? {
      ca: caCertificate.replace(/\\n/g, "\n"),
      rejectUnauthorized: false,
    }
  : dbConfig.useSsl
    ? {
        rejectUnauthorized: false,
      }
    : undefined;

declare global {
  // eslint-disable-next-line no-var
  var __gogiDbPool: mysql.Pool | undefined;
  // eslint-disable-next-line no-var
  var __gogiDbLogged: boolean | undefined;
}

if (!globalThis.__gogiDbLogged) {
  console.log("[db] Conectando a MySQL", {
    DB_HOST: dbConfig.host,
    DB_NAME: dbConfig.database,
    DB_USER: dbConfig.user,
    DB_PORT: dbConfig.port,
    DB_SSL: dbConfig.useSsl,
    DATABASE_URL_EXISTS: Boolean(process.env.DATABASE_URL),
    DATABASE_URL_MASKED: maskedDatabaseUrl,
    DB_SSL_CA_EXISTS: Boolean(process.env.DB_SSL_CA || process.env.DB_CA),
    DB_SSL_CA_SOURCE: dbSslSummary.source,
    DB_SSL_CA_LOADED: Boolean(sslConfig),
    DB_SSL_CA_LENGTH: dbSslSummary.certificateLength,
    DB_NAME_IS_EXPECTED: dbConfig.database === "gogiEats",
    DB_NAME_LOOKS_SUSPICIOUS: ["gogi", "defaultdb"].includes(dbConfig.database),
    NODE_ENV: process.env.NODE_ENV ?? "development",
  });
  globalThis.__gogiDbLogged = true;
}

const pool =
  globalThis.__gogiDbPool ??
  mysql.createPool({
    host: dbConfig.host,
    port: dbConfig.port,
    user: dbConfig.user,
    password: dbConfig.password,
    database: dbConfig.database,
    waitForConnections: true,
    connectionLimit: 5,
    queueLimit: 0,
    ssl: dbConfig.useSsl ? sslConfig : undefined,
  });

if (!globalThis.__gogiDbPool) {
  globalThis.__gogiDbPool = pool;
}

export function logDbUsage(
  endpoint: string,
  payload?: {
    userId?: number | null;
    email?: string | null;
    role?: string | string[] | null;
  },
) {
  console.log("[db] endpoint", {
    endpoint,
    DB_HOST: dbConfig.host,
    DB_NAME: dbConfig.database,
    connectedUser: dbConfig.user,
    userId: payload?.userId ?? null,
    email: payload?.email ?? null,
    role: payload?.role ?? null,
  });
}

export function getDbRuntimeConfig() {
  return {
    DB_HOST: dbConfig.host,
    DB_NAME: dbConfig.database,
    DB_USER: dbConfig.user,
    DB_PORT: dbConfig.port,
  };
}

export default pool;
