import mysql from "mysql2/promise";

import { getDbSslSummary, resolveDbSslCaContent } from "@/lib/db-ssl";
import { areInternalToolsEnabled } from "@/lib/internal-tools";
import { logger } from "@/lib/logger";

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
      logger.warn("db.database_url_invalid", "DATABASE_URL inválida", {
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const host =
    parsedUrl?.hostname?.trim() || process.env.DB_HOST?.trim() || null;
  const database =
    parsedUrl?.pathname.replace(/^\//, "").trim() ||
    process.env.DB_NAME?.trim() ||
    null;
  const portCandidate =
    parsedUrl?.port?.trim() || process.env.DB_PORT?.trim() || "3306";
  const port = Number(portCandidate);
  const user =
    (parsedUrl?.username ? decodeURIComponent(parsedUrl.username) : "") ||
    process.env.DB_USER?.trim() ||
    null;
  const password =
    ((parsedUrl?.password ? decodeURIComponent(parsedUrl.password) : "") ||
      process.env.DB_PASSWORD) ??
    process.env.DB_PASS ??
    "";

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

  if (parsedUrl) {
    const envHost = process.env.DB_HOST?.trim() ?? null;
    const envDatabase = process.env.DB_NAME?.trim() ?? null;
    const envPort = process.env.DB_PORT?.trim() ?? null;
    const envUser = process.env.DB_USER?.trim() ?? null;

    if (
      (envHost && envHost !== host) ||
      (envDatabase && envDatabase !== database) ||
      (envPort && envPort !== String(port)) ||
      (envUser && envUser !== user)
    ) {
      logger.warn(
        "db.database_url_mismatch",
        "DATABASE_URL y DB_* no coinciden; mysql2 usará DATABASE_URL",
        {
          databaseUrlMasked: getMaskedDatabaseUrl(existingUrl),
          dbHost: envHost,
          dbName: envDatabase,
          dbPort: envPort,
          dbUser: envUser ? `${envUser.slice(0, 2)}***` : null,
          resolvedHost: host,
          resolvedDatabase: database,
          resolvedPort: port,
          resolvedUser: `${user.slice(0, 2)}***`,
        },
      );
    }
  }

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

if (!globalThis.__gogiDbLogged && areInternalToolsEnabled()) {
  logger.debug("db.pool_init", "Conectando a MySQL", {
    host: dbConfig.host,
    database: dbConfig.database,
    port: dbConfig.port,
    sslEnabled: dbConfig.useSsl,
    databaseUrlExists: Boolean(process.env.DATABASE_URL),
    databaseUrlMasked: maskedDatabaseUrl,
    sslCaExists: Boolean(process.env.DB_SSL_CA || process.env.DB_CA),
    sslCaSource: dbSslSummary.source,
    sslCaLoaded: Boolean(sslConfig),
    sslCaLength: dbSslSummary.certificateLength,
    sslIgnoredSources: dbSslSummary.ignoredSources,
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
  if (!areInternalToolsEnabled()) {
    return;
  }

  logger.debug("db.endpoint_usage", "Uso de endpoint con base de datos", {
    route: endpoint,
    database: dbConfig.database,
    userId: payload?.userId ?? null,
    role: payload?.role ?? null,
    email: payload?.email ?? null,
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
