const test = require("node:test");
const assert = require("node:assert/strict");

const { evaluateIsolationChecks } = require("./check-environment-isolation");

const safeEnv = {
  APP_ENV: "staging",
  DATABASE_ENV: "staging",
  NODE_ENV: "development",
  VERCEL_ENV: "preview",
  DATABASE_URL:
    "mysql://staging_user:pass@staging-db.example.com:3306/gogi_staging",
  DB_NAME: "gogi_staging",
  DB_HOST: "staging-db.example.com",
  NEXT_PUBLIC_APP_URL: "https://preview-staging.example.vercel.app",
  NEXT_PUBLIC_MERCADOPAGO_PUBLIC_KEY: "APP_TEST-STAGING-PUBLIC",
  MERCADOPAGO_ACCESS_TOKEN: "APP_TEST-STAGING-ACCESS",
  PRODUCTION_DB_NAME: "gogi_prod",
  PRODUCTION_DB_HOST_FINGERPRINT: "prodhost0001",
  PRODUCTION_DB_USER: "prod_writer",
  PRODUCTION_DB_USER_FINGERPRINT: "produser0001",
};

const guardedSource = `
const { assertSafeWriteTarget } = require("./lib/db-write-guard");
assertSafeWriteTarget({ operation: "scripts/seed-staging-qa.js --write" });
`;

test("passes when env is isolated and every dangerous script imports the guard", () => {
  const result = evaluateIsolationChecks({
    env: safeEnv,
    trackedFiles: [".env.example", "docs/staging-setup.md"],
    readFile: () => guardedSource,
    rootDir: process.cwd(),
  });

  assert.equal(result.result, "ENVIRONMENT ISOLATION CHECK PASSED");
});

test("fails when a real env file is tracked", () => {
  const result = evaluateIsolationChecks({
    env: safeEnv,
    trackedFiles: [".env.local", ".env.example"],
    readFile: () => guardedSource,
    rootDir: process.cwd(),
  });

  assert.equal(result.result, "ENVIRONMENT ISOLATION CHECK FAILED");
  assert(result.failures.includes("TRACKED_REAL_ENV_FILE"));
});

test("fails when preview credentials are not verified as test", () => {
  const result = evaluateIsolationChecks({
    env: {
      ...safeEnv,
      NEXT_PUBLIC_MERCADOPAGO_PUBLIC_KEY: "APP_USR-ambiguous-public",
      MERCADOPAGO_ACCESS_TOKEN: "APP_USR-ambiguous-access",
    },
    trackedFiles: [".env.example"],
    readFile: () => guardedSource,
    rootDir: process.cwd(),
  });

  assert.equal(result.result, "ENVIRONMENT ISOLATION CHECK FAILED");
  assert(result.failures.includes("PREVIEW_MERCADOPAGO_PUBLIC_KEY_NOT_TEST"));
  assert(result.failures.includes("PREVIEW_MERCADOPAGO_ACCESS_TOKEN_NOT_TEST"));
});

test("allows preview on a shared host when staging guard conditions are fully met", () => {
  const result = evaluateIsolationChecks({
    env: {
      ...safeEnv,
      DATABASE_URL:
        "mysql://staging_user:pass@shared-db.example.com:3306/gogi_staging",
      DB_HOST: "shared-db.example.com",
      PRODUCTION_DB_HOST: "shared-db.example.com",
      PRODUCTION_DB_HOST_FINGERPRINT: "",
      ALLOW_STAGING_DB_WRITES: "true",
      ALLOW_SHARED_DB_HOST_FOR_STAGING: "true",
    },
    trackedFiles: [".env.example"],
    readFile: () => guardedSource,
    rootDir: process.cwd(),
  });

  assert.equal(result.result, "ENVIRONMENT ISOLATION CHECK PASSED");
  assert.equal(result.runtime.hostMatchesProduction, true);
  assert.equal(result.runtime.sharedHostAllowed, true);
  assert.equal(result.runtime.userMatchesProduction, false);
});

test("fails preview shared host when the explicit shared-host flag is missing", () => {
  const result = evaluateIsolationChecks({
    env: {
      ...safeEnv,
      DATABASE_URL:
        "mysql://staging_user:pass@shared-db.example.com:3306/gogi_staging",
      DB_HOST: "shared-db.example.com",
      PRODUCTION_DB_HOST: "shared-db.example.com",
      PRODUCTION_DB_HOST_FINGERPRINT: "",
      ALLOW_STAGING_DB_WRITES: "true",
    },
    trackedFiles: [".env.example"],
    readFile: () => guardedSource,
    rootDir: process.cwd(),
  });

  assert.equal(result.result, "ENVIRONMENT ISOLATION CHECK FAILED");
  assert(result.failures.includes("PREVIEW_DATABASE_MATCHES_PRODUCTION"));
});

test("fails when a dangerous script omits the guard import", () => {
  const result = evaluateIsolationChecks({
    env: safeEnv,
    trackedFiles: [".env.example"],
    readFile: () => "console.log('unsafe');",
    rootDir: process.cwd(),
  });

  assert.equal(result.result, "ENVIRONMENT ISOLATION CHECK FAILED");
  assert(result.failures.includes("DANGEROUS_SCRIPT_WITHOUT_GUARD"));
});
