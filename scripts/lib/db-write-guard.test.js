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
  DATABASE_URL:
    "mysql://user:pass@staging-db.gogieats-preview.net:3306/gogi_staging",
  DB_NAME: "gogi_staging",
  DB_HOST: "staging-db.gogieats-preview.net",
  DB_USER: "staging_user",
  PRODUCTION_DB_NAME: "gogi_prod",
  PRODUCTION_DB_USER: "prod_writer",
  PRODUCTION_DB_HOST_FINGERPRINT: "2a6ebe8307c4",
  PRODUCTION_DB_USER_FINGERPRINT: "77889900aabb",
};

test("blocks writes against gogi_prod even with explicit flag", () => {
  assert.throws(
    () =>
      assertSafeWriteTarget({
        operation: "prisma/seed.js",
        env: {
          ...guardedStagingEnv,
          DATABASE_URL:
            "mysql://user:pass@staging-db.gogieats-preview.net:3306/gogi_prod",
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

test("blocks writes when required staging signals are missing", () => {
  assert.throws(
    () =>
      assertSafeWriteTarget({
        operation: "prisma/seed.js",
        env: {
          ...guardedStagingEnv,
          APP_ENV: "",
          DATABASE_ENV: "",
        },
      }),
    /APP_ENV_NOT_STAGING_OR_TEST|DATABASE_ENV_NOT_STAGING_OR_TEST/i,
  );
});

test("blocks shared-host writes even with the explicit shared-host flag", () => {
  assert.throws(
    () =>
      assertSafeWriteTarget({
        operation: "prisma/seed.js",
        env: {
          ...guardedStagingEnv,
          DATABASE_URL:
            "mysql://staging_user:pass@shared-db.gogieats-preview.net:3306/gogi_staging",
          DB_HOST: "shared-db.gogieats-preview.net",
          PRODUCTION_DB_HOST: "shared-db.gogieats-preview.net",
          PRODUCTION_DB_HOST_FINGERPRINT: "",
          ALLOW_SHARED_DB_HOST_FOR_STAGING: "true",
        },
      }),
    /SHARED_DB_HOST_REQUIRES_VERIFIED_PERMISSION_SCOPE/i,
  );
});

test("blocks shared-host writes without the explicit shared-host flag", () => {
  assert.throws(
    () =>
      assertSafeWriteTarget({
        operation: "prisma/seed.js",
        env: {
          ...guardedStagingEnv,
          DATABASE_URL:
            "mysql://staging_user:pass@shared-db.gogieats-preview.net:3306/gogi_staging",
          DB_HOST: "shared-db.gogieats-preview.net",
          PRODUCTION_DB_HOST: "shared-db.gogieats-preview.net",
          PRODUCTION_DB_HOST_FINGERPRINT: "",
          ALLOW_SHARED_DB_HOST_FOR_STAGING: "false",
        },
      }),
    /DATABASE_HOST_MATCHES_PRODUCTION/i,
  );
});

test("blocks writes when the database user matches a managed or production user", () => {
  assert.throws(
    () =>
      assertSafeWriteTarget({
        operation: "prisma/seed.js",
        env: {
          ...guardedStagingEnv,
          DB_USER: "prod_writer",
          DATABASE_URL:
            "mysql://prod_writer:pass@staging-db.gogieats-preview.net:3306/gogi_staging",
        },
      }),
    /DATABASE_USER_MATCHES_PRODUCTION/i,
  );
});

test("blocks non-allowlisted write operations", () => {
  assert.throws(
    () =>
      assertSafeWriteTarget({
        operation: "scripts/not-allowlisted.js",
        env: guardedStagingEnv,
      }),
    /OPERATION_NOT_ALLOWED/i,
  );
});

test("sanitizes host and preserves operation metadata", () => {
  const summary = buildSanitizedDbOperationSummary({
    operation: "cleanup-business-owners",
    mode: "read",
    env: {
      APP_ENV: "staging",
      DATABASE_ENV: "staging",
      DATABASE_URL:
        "mysql://user:pass@preview-db.gogieats-preview.net:3306/gogi_stage",
      PRODUCTION_DB_HOST_FINGERPRINT: "2a6ebe8307c4",
      VERCEL_ENV: "preview",
    },
  });

  assert.equal(summary.operation, "cleanup-business-owners");
  assert.equal(summary.mode, "read");
  assert.equal(summary.runtimeEnvironment, "preview");
  assert.equal(summary.databaseName, "gogi_stage");
  assert.match(summary.databaseHost ?? "", /^prev\*\*\*\.net$/);
  assert.equal(summary.writeAllowed, false);
});
