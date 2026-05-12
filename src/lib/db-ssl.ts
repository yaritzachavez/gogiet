import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const CERTIFICATE_HEADER = "-----BEGIN CERTIFICATE-----";
const RUNTIME_CA_FILENAME = "gogiet-aiven-ca.pem";

function normalizePemValue(value: string) {
  return value.replace(/\\n/g, "\n").trim();
}

function getDbCaSource() {
  if (process.env.DB_CA?.trim()) {
    return {
      source: "DB_CA" as const,
      value: process.env.DB_CA.trim(),
    };
  }

  if (process.env.DB_SSL_CA?.trim()) {
    return {
      source: "DB_SSL_CA" as const,
      value: process.env.DB_SSL_CA.trim(),
    };
  }

  return {
    source: null,
    value: null,
  };
}

type DbSslSummary = {
  source: "DB_CA" | "DB_SSL_CA" | null;
  hasCertificate: boolean;
  looksLikePath: boolean;
  certificateLength: number | null;
};

export function getDbSslSummary(): DbSslSummary {
  const { source, value } = getDbCaSource();

  return {
    source,
    hasCertificate: Boolean(value?.includes(CERTIFICATE_HEADER)),
    looksLikePath:
      Boolean(value) &&
      !String(value).includes(CERTIFICATE_HEADER) &&
      /[\\/]|\.pem$/i.test(String(value)),
    certificateLength: value ? normalizePemValue(value).length : null,
  };
}

export function resolveDbSslCaContent() {
  const { source, value } = getDbCaSource();

  if (!value) {
    return null;
  }

  if (value.includes(CERTIFICATE_HEADER)) {
    return normalizePemValue(value);
  }

  console.warn(
    "[db-ssl] Certificado SSL ignorado: se esperaba PEM inline en env",
    {
      source,
      looksLikePath: /[\\/]|\.pem$/i.test(value),
      valueLength: value.length,
    },
  );

  return null;
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

  console.info("[db-ssl] Runtime CA listo", {
    path: certificatePath,
    source: getDbSslSummary().source,
    certificateLoaded: true,
    certificateLength: certificate.length,
  });

  return certificatePath;
}

export function applyMysqlSslParams(databaseUrl: string) {
  const certificatePath = ensureRuntimeCaFile();

  if (!certificatePath) {
    return databaseUrl;
  }

  const parsedUrl = new URL(databaseUrl);
  parsedUrl.searchParams.delete("ssl-mode");
  parsedUrl.searchParams.delete("sslcert");
  parsedUrl.searchParams.set("sslaccept", "accept_invalid_certs");
  parsedUrl.searchParams.set("sslcert", certificatePath);

  return parsedUrl.toString();
}
