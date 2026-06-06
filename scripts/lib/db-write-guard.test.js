const test = require("node:test");
const assert = require("node:assert/strict");

const {
  assertSafeWriteTarget,
  buildSanitizedDbOperationSummary,
} = require("./db-write-guard");

const guardedStagingEnv = {
  APP_ENV: "staging",
  DATABASE_ENV: "staging",
  NODE_ENV: "development",
  VERCEL_ENV: "preview",
  ALLOW_STAGING_DB_WRITES: "true",
  DATABASE_URL: "mysql://user:pass@staging.example.com:3306/gogi_staging",
  DB_NAME: "gogi_staging",
  DB_HOST: "staging.example.com",
  DB_USER: "staging_user",
  PRODUCTION_DB_NAME: "gogi_prod",
  PRODUCTION_DB_HOST_FINGERPRINT: "prodhost0001",
  PRODUCTION_DB_USER_FINGERPRINT: "produser0001",
};

test("blocks writes against gogi_prod even with explicit flag", () => {
  assert.throws(
    () =>
      assertSafeWriteTarget({
        operation: "prisma/seed.js",
        env: {
          ...guardedStagingEnv,
          DATABASE_URL: "mysql://user:pass@staging.example.com:3306/gogi_prod",
          DB_NAME: "gogi_prod",
        },
      }),
    /DATABASE_TARGETS_PRODUCTION/i,
  );
});

test("blocks writes in staging without explicit flag", () => {
  assert.throws(
    () =>
      assertSafeWriteTarget({
        operation: "prisma/seed.js",
        env: {
          ...guardedStagingEnv,
          ALLOW_STAGING_DB_WRITES: "false",
        },
      }),
    /ALLOW_STAGING_DB_WRITES_FALSE/i,
  );
});

test("allows writes in isolated staging with explicit flag", () => {
  const summary = assertSafeWriteTarget({
    operation: "prisma/seed.js",
    env: guardedStagingEnv,
  });

  assert.equal(summary.databaseName, "gogi_staging");
  assert.equal(summary.isProductionDatabase, false);
  assert.equal(summary.allowStagingWrites, true);
});

test("sanitizes host and preserves operation metadata", () => {
  const summary = buildSanitizedDbOperationSummary({
    operation: "cleanup-business-owners",
    mode: "read",
    env: {
      APP_ENV: "staging",
      DATABASE_ENV: "staging",
      DATABASE_URL: "mysql://user:pass@preview-db.example.com:3306/gogi_stage",
      PRODUCTION_DB_HOST_FINGERPRINT: "prodhost0001",
      VERCEL_ENV: "preview",
    },
  });

  assert.equal(summary.operation, "cleanup-business-owners");
  assert.equal(summary.mode, "read");
  assert.equal(summary.runtimeEnvironment, "preview");
  assert.equal(summary.databaseName, "gogi_stage");
  assert.match(summary.databaseHost ?? "", /^prev\*\*\*\.com$/);
  assert.equal(summary.writeAllowed, false);
});
