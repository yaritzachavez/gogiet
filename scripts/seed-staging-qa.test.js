const test = require("node:test");
const assert = require("node:assert/strict");

const { buildStagingQaManifest } = require("./lib/staging-qa-fixtures");
const { buildDryRunPreview } = require("./seed-staging-qa");

test("staging QA manifest only contains clearly fake QA data", () => {
  const manifest = buildStagingQaManifest();

  assert.equal(manifest.tag, "QA-STAGING");
  assert.equal(manifest.users.length, 5);
  for (const user of manifest.users) {
    assert.match(user.email, /@gogieats\.test$/);
  }
  assert.match(manifest.product.sku, /^QA-STAGING-/);
  assert.match(manifest.shippingZone.nombre, /^QA STAGING/);
});

test("staging QA seed defaults to dry-run and never claims writes", () => {
  const preview = buildDryRunPreview({
    APP_ENV: "development",
    DATABASE_ENV: "development",
    DATABASE_URL: "mysql://dev:dev@localhost:3306/gogi_dev",
  });

  assert.equal(preview.mode, "dry-run");
  assert.equal(preview.writesExecuted, false);
  assert.equal(preview.operation, "scripts/seed-staging-qa.js --write");
});
