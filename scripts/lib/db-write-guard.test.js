const test = require("node:test");
const assert = require("node:assert/strict");

const {
  assertSafeWriteTarget,
  buildSanitizedDbOperationSummary,
} = require("./db-write-guard");

test("blocks writes against gogi_prod even with explicit flag", () => {
  assert.throws(
    () =>
      assertSafeWriteTarget({
        operation: "seed",
        env: {
          NODE_ENV: "development",
          DATABASE_URL: "mysql://user:pass@staging.example.com:3306/gogi_prod",
          ALLOW_STAGING_DB_WRITES: "true",
        },
      }),
    /production database target/i,
  );
});

test("blocks writes in staging without explicit flag", () => {
  assert.throws(
    () =>
      assertSafeWriteTarget({
        operation: "seed",
        env: {
          NODE_ENV: "development",
          DATABASE_URL:
            "mysql://user:pass@staging.example.com:3306/gogi_staging",
        },
      }),
    /ALLOW_STAGING_DB_WRITES=true/i,
  );
});

test("allows writes in isolated staging with explicit flag", () => {
  const summary = assertSafeWriteTarget({
    operation: "seed",
    env: {
      NODE_ENV: "development",
      DATABASE_URL: "mysql://user:pass@staging.example.com:3306/gogi_staging",
      ALLOW_STAGING_DB_WRITES: "true",
    },
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
      DATABASE_URL: "mysql://user:pass@preview-db.example.com:3306/gogi_stage",
      VERCEL_ENV: "preview",
    },
  });

  assert.equal(summary.operation, "cleanup-business-owners");
  assert.equal(summary.mode, "read");
  assert.equal(summary.runtimeEnvironment, "preview");
  assert.equal(summary.databaseName, "gogi_stage");
  assert.match(summary.databaseHost ?? "", /^prev\*\*\*\.com$/);
});
