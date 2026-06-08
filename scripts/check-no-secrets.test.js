const test = require("node:test");
const assert = require("node:assert/strict");

const { SECRET_PATTERNS, shouldScan } = require("./check-no-secrets");

test("shouldScan skips examples and docs", () => {
  assert.equal(shouldScan(".env.example"), false);
  assert.equal(shouldScan("docs/staging-setup.md"), false);
  assert.equal(shouldScan("scripts/check-no-secrets.test.js"), false);
  assert.equal(shouldScan("src/app/api/auth/login/route.ts"), true);
});

test("secret patterns catch real-looking production tokens", () => {
  assert.equal(
    SECRET_PATTERNS.some((pattern) =>
      pattern.test("MERCADOPAGO_ACCESS_TOKEN=APP_USR-1234567890ABCDEF"),
    ),
    true,
  );
});

test("secret patterns ignore documented placeholders", () => {
  assert.equal(
    SECRET_PATTERNS.some((pattern) =>
      pattern.test(
        "DATABASE_URL=mysql://USUARIO_STAGING:CONTRASEÑA@HOST:PUERTO/gogi_staging",
      ),
    ),
    false,
  );
});
