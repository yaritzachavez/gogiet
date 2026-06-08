#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const {
  classifyMercadoPagoCredential,
  evaluateStagingEnvironment,
  parseDatabaseTarget,
} = require("./lib/staging-environment");

const DANGEROUS_WRITE_SCRIPTS = [
  "prisma/seed.js",
  "scripts/activate-verified-users.js",
  "scripts/cleanup-business-owners.js",
  "scripts/cleanup-test-stores-products.ts",
  "scripts/cleanup-staging-qa.js",
  "scripts/ensure-business-owners-table.js",
  "scripts/repair-business-relations.js",
  "scripts/seed-products.js",
  "scripts/seed-staging-qa.js",
];

function getTrackedFiles(rootDir = process.cwd()) {
  try {
    return execFileSync("git", ["ls-files"], {
      cwd: rootDir,
      encoding: "utf8",
    })
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}

function hasGuardImport(_filePath, sourceText) {
  return (
    sourceText.includes("assertSafeWriteTarget") &&
    sourceText.includes("db-write-guard")
  );
}

function evaluateIsolationChecks({
  env = process.env,
  rootDir = process.cwd(),
  trackedFiles = getTrackedFiles(rootDir),
  readFile = (filePath) => fs.readFileSync(filePath, "utf8"),
} = {}) {
  const staging = evaluateStagingEnvironment(env);
  const databaseTarget = parseDatabaseTarget(env);
  const mercadoPagoPublicKey = classifyMercadoPagoCredential(
    env.NEXT_PUBLIC_MERCADOPAGO_PUBLIC_KEY,
  );
  const mercadoPagoAccessToken = classifyMercadoPagoCredential(
    env.MERCADOPAGO_ACCESS_TOKEN,
  );
  const failures = [];

  if (
    staging.appEnv === "staging" &&
    (!staging.databaseName || staging.databaseName === "gogi_prod")
  ) {
    failures.push("STAGING_APP_ENV_POINTS_TO_PRODUCTION_DATABASE");
  }

  if (
    staging.appEnv &&
    staging.databaseEnv &&
    staging.appEnv !== staging.databaseEnv &&
    !(staging.appEnv === "preview" && staging.databaseEnv === "staging")
  ) {
    failures.push("APP_ENV_AND_DATABASE_ENV_MISMATCH");
  }

  if (
    staging.vercelEnv === "preview" &&
    (staging.databaseName === "gogi_prod" ||
      staging.userMatchesProduction ||
      (staging.hostMatchesProduction && !staging.sharedHostAllowed))
  ) {
    failures.push("PREVIEW_DATABASE_MATCHES_PRODUCTION");
  }

  if (
    staging.vercelEnv === "preview" &&
    mercadoPagoPublicKey.state !== "test"
  ) {
    failures.push("PREVIEW_MERCADOPAGO_PUBLIC_KEY_NOT_TEST");
  }

  if (
    staging.vercelEnv === "preview" &&
    mercadoPagoAccessToken.state !== "test"
  ) {
    failures.push("PREVIEW_MERCADOPAGO_ACCESS_TOKEN_NOT_TEST");
  }

  const realTrackedEnvFiles = trackedFiles.filter((filePath) => {
    const normalized = filePath.replace(/\\/g, "/");
    return (
      normalized.startsWith(".env") &&
      !normalized.endsWith(".example") &&
      normalized !== ".env.example"
    );
  });

  if (realTrackedEnvFiles.length > 0) {
    failures.push("TRACKED_REAL_ENV_FILE");
  }

  const dangerousScriptsWithoutGuard = [];
  for (const relativePath of DANGEROUS_WRITE_SCRIPTS) {
    const absolutePath = path.join(rootDir, relativePath);
    if (!fs.existsSync(absolutePath)) {
      continue;
    }

    const sourceText = readFile(absolutePath);
    if (!hasGuardImport(relativePath, sourceText)) {
      dangerousScriptsWithoutGuard.push(relativePath);
    }
  }

  if (dangerousScriptsWithoutGuard.length > 0) {
    failures.push("DANGEROUS_SCRIPT_WITHOUT_GUARD");
  }

  return {
    runtime: {
      appEnv: staging.appEnv,
      databaseEnv: staging.databaseEnv,
      nodeEnv: staging.nodeEnv,
      vercelEnv: staging.vercelEnv,
      databaseName: staging.databaseName,
      databaseHost: staging.databaseHost,
      databaseHostFingerprint: staging.databaseHostFingerprint,
      databaseUrlPresent: staging.databaseUrlPresent,
      databaseUrlParseable: staging.databaseUrlParseable,
      mercadoPagoPublicKeyState: mercadoPagoPublicKey.state,
      mercadoPagoAccessTokenState: mercadoPagoAccessToken.state,
      blockingReasons: staging.blockingReasons,
      allowSharedDbHostForStaging: staging.allowSharedDbHostForStaging,
      hostMatchesProduction: staging.hostMatchesProduction,
      userMatchesProduction: staging.userMatchesProduction,
      sharedHostAllowed: staging.sharedHostAllowed,
    },
    trackedRealEnvFiles: realTrackedEnvFiles,
    dangerousScriptsWithoutGuard,
    result:
      failures.length === 0
        ? "ENVIRONMENT ISOLATION CHECK PASSED"
        : "ENVIRONMENT ISOLATION CHECK FAILED",
    failures,
    databaseTarget: {
      databaseName: databaseTarget.databaseName,
      hostFingerprint: databaseTarget.hostFingerprint,
    },
  };
}

if (require.main === module) {
  const result = evaluateIsolationChecks();
  console.info(JSON.stringify(result, null, 2));
  process.exit(result.result === "ENVIRONMENT ISOLATION CHECK PASSED" ? 0 : 1);
}

module.exports = {
  DANGEROUS_WRITE_SCRIPTS,
  evaluateIsolationChecks,
  getTrackedFiles,
  hasGuardImport,
};
