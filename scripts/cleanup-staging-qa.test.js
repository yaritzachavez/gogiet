const test = require("node:test");
const assert = require("node:assert/strict");

const { STAGING_QA_TAG } = require("./lib/staging-qa-fixtures");
const {
  assertExplicitConfirmation,
  buildDryRunPreview,
} = require("./cleanup-staging-qa");

test("staging QA cleanup stays in dry-run by default", () => {
  const preview = buildDryRunPreview({
    APP_ENV: "development",
    DATABASE_ENV: "development",
    DATABASE_URL: "mysql://dev:dev@localhost:3306/gogi_dev",
  });

  assert.equal(preview.mode, "dry-run");
  assert.equal(preview.writesExecuted, false);
  assert.equal(preview.confirmationRequired, STAGING_QA_TAG);
});

test("cleanup write mode requires explicit QA confirmation", () => {
  assert.throws(() => assertExplicitConfirmation(""), /--confirm=QA-STAGING/i);
  assert.doesNotThrow(() => assertExplicitConfirmation(STAGING_QA_TAG));
});
