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

function getRuntimeEnvironment() {
  const nodeEnv = String(process.env.NODE_ENV ?? "")
    .trim()
    .toLowerCase();
  const vercelEnv = String(process.env.VERCEL_ENV ?? "")
    .trim()
    .toLowerCase();

  if (nodeEnv !== "production") {
    return "development" as const;
  }

  if (vercelEnv === "preview") {
    return "preview" as const;
  }

  return "production" as const;
}

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
  const runtimeEnvironment = getRuntimeEnvironment();
  const existingUrl = process.env.DATABASE_URL?.trim();
  let parsedUrl: URL | null = null;

  if (!existingUrl && runtimeEnvironment === "production") {
    throw new Error(
      "[db] DATABASE_URL es obligatoria en producción y debe apuntar al host vigente de Aiven.",
    );
  }

  if (existingUrl) {
    try {
      parsedUrl = new URL(existingUrl);
    } catch (error) {
      if (runtimeEnvironment === "production") {
        throw new Error(
          `[db] DATABASE_URL inválida en producción: ${error instanceof Error ? error.message : String(error)}`,
        );
      }

      logger.warn("db.database_url_invalid", "DATABASE_URL inválida", {
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const preferDatabaseUrl =
    runtimeEnvironment === "production" || Boolean(parsedUrl);
  const host =
    parsedUrl?.hostname?.trim() ||
    (!preferDatabaseUrl ? process.env.DB_HOST?.trim() : null) ||
    null;
  const database =
    parsedUrl?.pathname.replace(/^\//, "").trim() ||
    (!preferDatabaseUrl ? process.env.DB_NAME?.trim() : null) ||
    null;
  const portCandidate =
    parsedUrl?.port?.trim() ||
    (!preferDatabaseUrl ? process.env.DB_PORT?.trim() : null) ||
    "3306";
  const port = Number(portCandidate);
  const user =
    (parsedUrl?.username ? decodeURIComponent(parsedUrl.username) : "") ||
    (!preferDatabaseUrl ? process.env.DB_USER?.trim() : null) ||
    null;
  const password =
    ((parsedUrl?.password ? decodeURIComponent(parsedUrl.password) : "") ||
      (!preferDatabaseUrl ? process.env.DB_PASSWORD : null)) ??
    (!preferDatabaseUrl ? process.env.DB_PASS : null) ??
    "";

  if (!host || !database || !user) {
    throw new Error(
      runtimeEnvironment === "production"
        ? "[db] DATABASE_URL no contiene host, base o usuario válidos para producción."
        : "[db] Faltan variables de conexión. Define DATABASE_URL completa o DB_HOST, DB_NAME y DB_USER.",
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
      if (
        runtimeEnvironment === "production" &&
        envDatabase &&
        envDatabase !== database
      ) {
        throw new Error(
          `[db] DB_NAME (${envDatabase}) no coincide con la base definida en DATABASE_URL (${database}) en producción.`,
        );
      }

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
const runtimeEnvironment = getRuntimeEnvironment();
const poolConnectionLimit = Math.max(
  1,
  Math.min(
    Number(process.env.DB_POOL_CONNECTION_LIMIT ?? "") ||
      (runtimeEnvironment === "production" ? 2 : 3),
    5,
  ),
);
const poolQueueLimit = Math.max(
  5,
  Math.min(Number(process.env.DB_POOL_QUEUE_LIMIT ?? "") || 25, 100),
);
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
  // eslint-disable-next-line no-var
  var __gogiDbRuntimeSummaryLogged: boolean | undefined;
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

if (
  !globalThis.__gogiDbRuntimeSummaryLogged &&
  getRuntimeEnvironment() === "production"
) {
  let databaseUrlHost: string | null = null;
  try {
    databaseUrlHost = process.env.DATABASE_URL
      ? new URL(process.env.DATABASE_URL).hostname
      : null;
  } catch {}

  logger.warn(
    "db.runtime_config_summary",
    "Resumen seguro de configuración DB en producción",
    {
      sourceOfTruth: "DATABASE_URL",
      databaseUrlExists: Boolean(process.env.DATABASE_URL),
      databaseUrlHost,
      dbHost: process.env.DB_HOST?.trim() ?? null,
      dbName: dbConfig.database,
      dbPort: dbConfig.port,
      sslEnabled: dbConfig.useSsl,
      hostMismatch:
        Boolean(databaseUrlHost) &&
        Boolean(process.env.DB_HOST?.trim()) &&
        databaseUrlHost !== process.env.DB_HOST?.trim(),
    },
  );
  globalThis.__gogiDbRuntimeSummaryLogged = true;
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
    connectionLimit: poolConnectionLimit,
    maxIdle: poolConnectionLimit,
    idleTimeout: 30_000,
    queueLimit: poolQueueLimit,
    enableKeepAlive: true,
    keepAliveInitialDelay: 0,
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

export function isTooManyConnectionsError(error: unknown) {
  const errorLike = error as {
    code?: unknown;
    errno?: unknown;
    message?: unknown;
  };
  const code = String(errorLike?.code ?? "").toUpperCase();
  const message = String(errorLike?.message ?? "").toLowerCase();

  return (
    code === "ER_CON_COUNT_ERROR" ||
    Number(errorLike?.errno) === 1040 ||
    message.includes("too many connections")
  );
}

export function getFriendlyDatabaseErrorMessage(error: unknown) {
  const errorLike = error as {
    code?: unknown;
    message?: unknown;
    name?: unknown;
  };
  const code = String(errorLike?.code ?? "").toUpperCase();
  const message = String(errorLike?.message ?? "").toLowerCase();
  const name = String(errorLike?.name ?? "").toLowerCase();

  if (
    code === "ENOTFOUND" ||
    message.includes("getaddrinfo enotfound") ||
    name.includes("prismaclientinitializationerror")
  ) {
    return "No pudimos conectar con la base de datos. Intenta de nuevo en unos segundos.";
  }

  if (isTooManyConnectionsError(error)) {
    return "No pudimos cargar los datos en este momento. Intenta de nuevo en unos segundos.";
  }

  return "No pudimos cargar los datos, intenta de nuevo.";
}

export default pool;
