import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { logger } from "@/lib/logger";

const CERTIFICATE_HEADER = "-----BEGIN CERTIFICATE-----";
const RUNTIME_CA_FILENAME = "gogiet-aiven-ca.pem";

type DbRuntimeEnvironment = "development" | "preview" | "production";

function normalizePemValue(value: string) {
  return value.replace(/\\n/g, "\n").trim();
}

type RawCandidate = {
  source: "DB_CA" | "DB_SSL_CA";
  value: string;
};

type SelectedCaCandidate = {
  source: "DB_CA" | "DB_SSL_CA";
  value: string;
  ignoredSources: Array<{
    source: "DB_CA" | "DB_SSL_CA";
    reason: "empty" | "path-like" | "invalid-pem";
    valueLength: number;
  }>;
} | null;

function getRawCandidates(): RawCandidate[] {
  return [
    ["DB_CA", process.env.DB_CA],
    ["DB_SSL_CA", process.env.DB_SSL_CA],
  ]
    .map(([source, value]) => ({
      source: source as "DB_CA" | "DB_SSL_CA",
      value: String(value ?? "").trim(),
    }))
    .filter((candidate) => candidate.value.length > 0);
}

function selectDbCaCandidate(): SelectedCaCandidate {
  const ignoredSources: NonNullable<SelectedCaCandidate>["ignoredSources"] = [];

  for (const candidate of getRawCandidates()) {
    if (!candidate.value) {
      ignoredSources.push({
        source: candidate.source,
        reason: "empty",
        valueLength: 0,
      });
      continue;
    }

    const normalizedValue = normalizePemValue(candidate.value);
    const looksLikePem = normalizedValue.includes(CERTIFICATE_HEADER);
    const looksLikePath =
      !looksLikePem && /[\\/]|\.pem$/i.test(String(candidate.value));

    if (looksLikePem) {
      return {
        source: candidate.source,
        value: normalizedValue,
        ignoredSources,
      };
    }

    ignoredSources.push({
      source: candidate.source,
      reason: looksLikePath ? "path-like" : "invalid-pem",
      valueLength: candidate.value.length,
    });
  }

  return null;
}

type DbSslSummary = {
  source: "DB_CA" | "DB_SSL_CA" | null;
  hasCertificate: boolean;
  looksLikePath: boolean;
  certificateLength: number | null;
  ignoredSources: Array<{
    source: "DB_CA" | "DB_SSL_CA";
    reason: "empty" | "path-like" | "invalid-pem";
    valueLength: number;
  }>;
};

export function getDbSslSummary(): DbSslSummary {
  const selected = selectDbCaCandidate();

  if (!selected) {
    const rawCandidates = getRawCandidates();
    const looksLikePath = rawCandidates.some((candidate) =>
      /[\\/]|\.pem$/i.test(candidate.value),
    );

    return {
      source: null,
      hasCertificate: false,
      looksLikePath,
      certificateLength: null,
      ignoredSources: rawCandidates.map((candidate) => ({
        source: candidate.source,
        reason: /[\\/]|\.pem$/i.test(candidate.value)
          ? "path-like"
          : "invalid-pem",
        valueLength: candidate.value.length,
      })),
    };
  }

  return {
    source: selected.source,
    hasCertificate: true,
    looksLikePath: false,
    certificateLength: selected.value.length,
    ignoredSources: selected.ignoredSources,
  };
}

export function getDbRuntimeEnvironment(
  env: NodeJS.ProcessEnv = process.env,
): DbRuntimeEnvironment {
  const nodeEnv = String(env.NODE_ENV ?? "")
    .trim()
    .toLowerCase();
  const vercelEnv = String(env.VERCEL_ENV ?? "")
    .trim()
    .toLowerCase();

  if (nodeEnv !== "production") {
    return "development";
  }

  if (vercelEnv === "preview") {
    return "preview";
  }

  return "production";
}

export function shouldUseDbSsl(
  env: NodeJS.ProcessEnv = process.env,
  host?: string | null,
) {
  const normalizedHost = String(host ?? env.DB_HOST ?? "").trim();
  return (
    normalizedHost.includes("aivencloud.com") ||
    Boolean(resolveDbSslCaContent()) ||
    String(env.DB_REQUIRE_SSL ?? "")
      .trim()
      .toLowerCase() === "true"
  );
}

export function resolveDbSslCaContent() {
  const selected = selectDbCaCandidate();

  if (!selected) {
    const summary = getDbSslSummary();

    if (summary.ignoredSources.length > 0) {
      logger.warn(
        "db.ssl_certificate_missing",
        "Ningún certificado SSL válido fue encontrado en env",
        {
          ignoredSourcesCount: summary.ignoredSources.length,
          ignoredSources: summary.ignoredSources,
        },
      );
    }

    return null;
  }

  if (selected.ignoredSources.length > 0) {
    logger.warn(
      "db.ssl_invalid_sources_ignored",
      "Se ignoraron variables SSL inválidas",
      {
        selectedSource: selected.source,
        ignoredSourcesCount: selected.ignoredSources.length,
        ignoredSources: selected.ignoredSources,
      },
    );
  }

  return selected.value;
}

export function ensureRuntimeCaFile() {
  const certificate = resolveDbSslCaContent();

  if (!certificate) {
    return null;
  }

  const certificatePath = path.join(os.tmpdir(), RUNTIME_CA_FILENAME);
  const certificateContents = `${certificate}\n`;

  if (
    !fs.existsSync(certificatePath) ||
    fs.readFileSync(certificatePath, "utf8") !== certificateContents
  ) {
    fs.writeFileSync(certificatePath, certificateContents, "utf8");
  }

  logger.info("db.runtime_ca_ready", "Runtime CA listo", {
    source: getDbSslSummary().source,
    certificateLoaded: true,
    certificateLength: certificate.length,
    runtimeFileCreated: true,
  });

  return certificatePath;
}

export function getMysqlSslConfig({
  env = process.env,
  host,
}: {
  env?: NodeJS.ProcessEnv;
  host?: string | null;
} = {}) {
  if (!shouldUseDbSsl(env, host)) {
    return undefined;
  }

  const caContent = resolveDbSslCaContent();

  if (!caContent) {
    return {};
  }

  return {
    ca: caContent.replace(/\\n/g, "\n"),
  };
}

export function applyMysqlSslParams(
  databaseUrl: string,
  env: NodeJS.ProcessEnv = process.env,
) {
  const certificatePath = ensureRuntimeCaFile();
  const parsedUrl = new URL(databaseUrl);

  parsedUrl.searchParams.delete("ssl-mode");
  parsedUrl.searchParams.delete("sslcert");
  parsedUrl.searchParams.delete("sslaccept");

  if (!shouldUseDbSsl(env, parsedUrl.hostname)) {
    return parsedUrl.toString();
  }

  parsedUrl.searchParams.set("sslaccept", "strict");

  if (certificatePath) {
    parsedUrl.searchParams.set("sslcert", certificatePath);
  }

  return parsedUrl.toString();
}
