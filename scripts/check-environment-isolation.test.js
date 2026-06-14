const test = require("node:test");
const assert = require("node:assert/strict");

const { evaluateIsolationChecks } = require("./check-environment-isolation");

const safeEnv = {
  APP_ENV: "staging",
  DATABASE_ENV: "staging",
  NODE_ENV: "development",
  VERCEL_ENV: "preview",
  DATABASE_URL:
    "mysql://staging_user:pass@staging-db.gogieats-preview.net:3306/gogi_staging",
  DB_NAME: "gogi_staging",
  DB_HOST: "staging-db.gogieats-preview.net",
  NEXT_PUBLIC_APP_URL: "https://gogi-staging-preview-12345.vercel.app",
  NEXT_PUBLIC_MERCADOPAGO_PUBLIC_KEY: "TEST-public-1234567890",
  MERCADOPAGO_ACCESS_TOKEN: "TEST-access-1234567890",
  PRODUCTION_DB_NAME: "gogi_prod",
  PRODUCTION_DB_HOST_FINGERPRINT: "2a6ebe8307c4",
  PRODUCTION_DB_USER: "prod_writer",
  PRODUCTION_DB_USER_FINGERPRINT: "77889900aabb",
};

const guardedSource = `
const { assertSafeWriteTarget } = require("./lib/db-write-guard");
assertSafeWriteTarget({ operation: "scripts/seed-staging-qa.js --write" });
`;

test("passes when env is isolated and every dangerous script imports the guard", () => {
  const result = evaluateIsolationChecks({
    env: safeEnv,
    trackedFiles: [
      ".env.example",
      "docs/staging-setup.md",
      "package-lock.json",
    ],
    readFile: () => guardedSource,
    rootDir: process.cwd(),
  });

  assert.equal(result.result, "ENVIRONMENT ISOLATION CHECK PASSED");
  assert.equal(result.packageLock.tracked, true);
});

test("fails when a real env file is tracked", () => {
  const result = evaluateIsolationChecks({
    env: safeEnv,
    trackedFiles: [".env.local", ".env.example", "package-lock.json"],
    readFile: () => guardedSource,
    rootDir: process.cwd(),
  });

  assert.equal(result.result, "ENVIRONMENT ISOLATION CHECK FAILED");
  assert(result.failures.includes("TRACKED_REAL_ENV_FILE"));
});

test("fails when preview credentials are placeholders or production-like", () => {
  const result = evaluateIsolationChecks({
    env: {
      ...safeEnv,
      NEXT_PUBLIC_MERCADOPAGO_PUBLIC_KEY: "APP_USR-ambiguous-public",
      MERCADOPAGO_ACCESS_TOKEN: "PEGA_AQUI_EL_ACCESS_TOKEN_DE_PRUEBA",
    },
    trackedFiles: [".env.example", "package-lock.json"],
    readFile: () => guardedSource,
    rootDir: process.cwd(),
  });

  assert.equal(result.result, "ENVIRONMENT ISOLATION CHECK FAILED");
  assert(result.failures.includes("PREVIEW_MERCADOPAGO_PUBLIC_KEY_NOT_TEST"));
  assert(result.failures.includes("PREVIEW_MERCADOPAGO_ACCESS_TOKEN_NOT_TEST"));
});

test("passes with a truly isolated preview configuration", () => {
  const result = evaluateIsolationChecks({
    env: {
      ...safeEnv,
      ALLOW_STAGING_DB_WRITES: "true",
    },
    trackedFiles: [".env.example", "package-lock.json"],
    readFile: () => guardedSource,
    rootDir: process.cwd(),
  });

  assert.equal(result.result, "ENVIRONMENT ISOLATION CHECK PASSED");
  assert.equal(result.runtime.hostMatchesProduction, false);
  assert.equal(result.runtime.sharedHostAllowed, false);
});

test("fails shared-host preview without the explicit shared-host flag", () => {
  const result = evaluateIsolationChecks({
    env: {
      ...safeEnv,
      DATABASE_URL:
        "mysql://staging_user:pass@shared-db.gogieats-preview.net:3306/gogi_staging",
      DB_HOST: "shared-db.gogieats-preview.net",
      PRODUCTION_DB_HOST: "shared-db.gogieats-preview.net",
      PRODUCTION_DB_HOST_FINGERPRINT: "",
      ALLOW_STAGING_DB_WRITES: "true",
      ALLOW_SHARED_DB_HOST_FOR_STAGING: "false",
    },
    trackedFiles: [".env.example", "package-lock.json"],
    readFile: () => guardedSource,
    rootDir: process.cwd(),
  });

  assert.equal(result.result, "ENVIRONMENT ISOLATION CHECK FAILED");
  assert(result.failures.includes("PREVIEW_DATABASE_MATCHES_PRODUCTION"));
  assert.equal(result.runtime.hostMatchesProduction, true);
  assert.equal(result.runtime.sharedHostAllowed, false);
  assert(
    result.runtime.blockingReasons.includes(
      "ALLOW_SHARED_DB_HOST_FOR_STAGING_FALSE",
    ),
  );
});

test("fails shared-host preview even with explicit flag because permission scope is not technically verifiable", () => {
  const result = evaluateIsolationChecks({
    env: {
      ...safeEnv,
      DATABASE_URL:
        "mysql://staging_user:pass@shared-db.gogieats-preview.net:3306/gogi_staging",
      DB_HOST: "shared-db.gogieats-preview.net",
      PRODUCTION_DB_HOST: "shared-db.gogieats-preview.net",
      PRODUCTION_DB_HOST_FINGERPRINT: "",
      ALLOW_STAGING_DB_WRITES: "true",
      ALLOW_SHARED_DB_HOST_FOR_STAGING: "true",
    },
    trackedFiles: [".env.example", "package-lock.json"],
    readFile: () => guardedSource,
    rootDir: process.cwd(),
  });

  assert.equal(result.result, "ENVIRONMENT ISOLATION CHECK FAILED");
  assert(result.failures.includes("STAGING_ENVIRONMENT_NOT_VERIFIED"));
  assert.equal(result.runtime.hostMatchesProduction, true);
  assert.equal(result.runtime.sharedHostAllowed, false);
  assert(
    result.runtime.blockingReasons.includes(
      "SHARED_DB_HOST_REQUIRES_VERIFIED_PERMISSION_SCOPE",
    ),
  );
  assert.equal(
    result.runtime.blockingReasons.includes(
      "ALLOW_SHARED_DB_HOST_FOR_STAGING_FALSE",
    ),
    false,
  );
});

test("fails when a dangerous script omits the guard import", () => {
  const result = evaluateIsolationChecks({
    env: safeEnv,
    trackedFiles: [".env.example", "package-lock.json"],
    readFile: () => "console.log('unsafe');",
    rootDir: process.cwd(),
  });

  assert.equal(result.result, "ENVIRONMENT ISOLATION CHECK FAILED");
  assert(result.failures.includes("DANGEROUS_SCRIPT_WITHOUT_GUARD"));
});

test("fails when staging verification itself is incomplete", () => {
  const result = evaluateIsolationChecks({
    env: {},
    trackedFiles: [".env.example", "package-lock.json"],
    readFile: () => guardedSource,
    rootDir: process.cwd(),
  });

  assert.equal(result.result, "ENVIRONMENT ISOLATION CHECK FAILED");
  assert(result.failures.includes("STAGING_ENVIRONMENT_NOT_VERIFIED"));
});

test("fails when package-lock.json stops being tracked", () => {
  const result = evaluateIsolationChecks({
    env: safeEnv,
    trackedFiles: [".env.example"],
    readFile: () => guardedSource,
    rootDir: process.cwd(),
  });

  assert.equal(result.result, "ENVIRONMENT ISOLATION CHECK FAILED");
  assert(result.failures.includes("PACKAGE_LOCK_NOT_TRACKED"));
});
