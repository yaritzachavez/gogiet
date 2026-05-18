import { type Prisma, PrismaClient } from "@prisma/client";

import {
  applyMysqlSslParams,
  ensureRuntimeCaFile,
  getDbSslSummary,
} from "@/lib/db-ssl";
import { areInternalToolsEnabled } from "@/lib/internal-tools";
import { logger } from "@/lib/logger";

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
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

function resolvePrismaDatabaseUrl() {
  const host = process.env.DB_HOST?.trim();
  const needsSsl =
    Boolean(host?.includes("aivencloud.com")) ||
    process.env.DB_SSL_CA ||
    process.env.DB_CA ||
    process.env.DB_REQUIRE_SSL === "true";
  const existingUrl = process.env.DATABASE_URL?.trim();
  const caPath = ensureRuntimeCaFile();
  const sslSummary = getDbSslSummary();

  if (areInternalToolsEnabled()) {
    logger.debug("prisma.ssl_env_status", "Estado SSL de Prisma", {
      databaseUrlExists: Boolean(existingUrl),
      databaseUrlMasked: getMaskedDatabaseUrl(existingUrl),
      dbSslCaExists: Boolean(process.env.DB_SSL_CA || process.env.DB_CA),
      dbSslCaSource: sslSummary.source,
      dbSslCaLoaded: sslSummary.hasCertificate,
      dbSslCaLength: sslSummary.certificateLength,
      dbSslIgnoredSources: sslSummary.ignoredSources,
      nodeEnv: process.env.NODE_ENV ?? "development",
      needsSsl,
      hasRuntimeCaFile: Boolean(caPath),
    });
  }

  if (existingUrl) {
    try {
      const parsedExistingUrl = new URL(existingUrl);
      const urlHost = parsedExistingUrl.hostname;
      const urlPort = parsedExistingUrl.port || "(default)";
      const urlDatabase = parsedExistingUrl.pathname.replace(/^\//, "");
      const envPort = process.env.DB_PORT?.trim() || "(default)";
      const hasManualConfig =
        Boolean(process.env.DB_HOST) ||
        Boolean(process.env.DB_USER) ||
        Boolean(process.env.DB_NAME);

      if (
        hasManualConfig &&
        ((host && urlHost && host !== urlHost) ||
          (process.env.DB_NAME?.trim() &&
            process.env.DB_NAME.trim() !== urlDatabase) ||
          (process.env.DB_PORT?.trim() && envPort !== urlPort))
      ) {
        logger.warn(
          "prisma.database_url_mismatch",
          "DATABASE_URL y DB_* no coinciden",
          {
            databaseUrlHost: urlHost,
            databaseUrlPort: urlPort,
            databaseUrlDatabase: urlDatabase,
            dbHost: host ?? null,
            dbPort: process.env.DB_PORT?.trim() ?? null,
            dbName: process.env.DB_NAME?.trim() ?? null,
          },
        );
      }
    } catch (error) {
      logger.warn(
        "prisma.database_url_inspection_failed",
        "No se pudo inspeccionar DATABASE_URL",
        {
          message: error instanceof Error ? error.message : String(error),
        },
      );
    }

    process.env.DATABASE_URL = needsSsl
      ? applyMysqlSslParams(existingUrl)
      : existingUrl;

    if (areInternalToolsEnabled()) {
      logger.debug(
        "prisma.database_url_final",
        "DATABASE_URL final para Prisma",
        {
          databaseUrlMasked: getMaskedDatabaseUrl(process.env.DATABASE_URL),
        },
      );
    }
    return process.env.DATABASE_URL;
  }

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
  const query = needsSsl ? "?sslaccept=accept_invalid_certs" : "";

  const url = `mysql://${encodedUser}:${encodedPassword}@${hostWithPort}/${encodedDatabase}${query}`;
  process.env.DATABASE_URL = needsSsl ? applyMysqlSslParams(url) : url;

  if (areInternalToolsEnabled()) {
    logger.debug(
      "prisma.database_url_generated",
      "DATABASE_URL generado desde DB_*",
      {
        host,
        database,
        port: port ?? "(default)",
        needsSsl,
        hasRuntimeCaFile: Boolean(caPath),
        databaseUrlMasked: getMaskedDatabaseUrl(process.env.DATABASE_URL),
      },
    );
  }

  return process.env.DATABASE_URL;
}

resolvePrismaDatabaseUrl();

const prismaClientOptions: Prisma.PrismaClientOptions = {
  log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
};

export const prisma =
  globalForPrisma.prisma ?? new PrismaClient(prismaClientOptions);

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
