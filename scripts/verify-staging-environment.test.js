const test = require("node:test");
const assert = require("node:assert/strict");

const { formatVerificationOutput } = require("./verify-staging-environment");

const verifiedEnv = {
  APP_ENV: "staging",
  DATABASE_ENV: "staging",
  NODE_ENV: "development",
  VERCEL_ENV: "preview",
  ALLOW_STAGING_DB_WRITES: "true",
  DATABASE_URL:
    "mysql://staging_user:pass@staging-db.example.com:3306/gogi_staging",
  DB_NAME: "gogi_staging",
  DB_HOST: "staging-db.example.com",
  DB_USER: "staging_user",
  PRODUCTION_DB_NAME: "gogi_prod",
  PRODUCTION_DB_HOST_FINGERPRINT: "prodhost0001",
  PRODUCTION_DB_USER_FINGERPRINT: "produser0001",
  NEXT_PUBLIC_APP_URL: "https://gogiet-staging-preview.vercel.app",
  NEXT_PUBLIC_MERCADOPAGO_PUBLIC_KEY: "APP_TEST-STAGING-PUBLIC",
  MERCADOPAGO_ACCESS_TOKEN: "APP_TEST-STAGING-ACCESS",
};

test("returns verified only when staging isolation is fully consistent", () => {
  const output = formatVerificationOutput(verifiedEnv);

  assert.equal(output.result, "STAGING ENVIRONMENT VERIFIED");
  assert.equal(output.databaseName, "gogi_staging");
  assert.equal(output.mercadoPagoPublicKeyState, "test");
  assert.equal(output.mercadoPagoAccessTokenState, "test");
});

test("fails when app url points to production", () => {
  const output = formatVerificationOutput({
    ...verifiedEnv,
    NEXT_PUBLIC_APP_URL: "https://www.gogieats.shop",
  });

  assert.equal(output.result, "STAGING ENVIRONMENT NOT VERIFIED");
  assert(output.blockingReasons.includes("APP_URL_POINTS_TO_PRODUCTION"));
});

test("fails when mercado pago credentials remain ambiguous", () => {
  const output = formatVerificationOutput({
    ...verifiedEnv,
    NEXT_PUBLIC_MERCADOPAGO_PUBLIC_KEY: "APP_USR-ambiguous-public",
    MERCADOPAGO_ACCESS_TOKEN: "APP_USR-ambiguous-access",
  });

  assert.equal(output.result, "STAGING ENVIRONMENT NOT VERIFIED");
  assert(
    output.blockingReasons.includes(
      "MERCADOPAGO_PUBLIC_KEY_NOT_VERIFIED_AS_TEST",
    ),
  );
  assert(
    output.blockingReasons.includes(
      "MERCADOPAGO_ACCESS_TOKEN_NOT_VERIFIED_AS_TEST",
    ),
  );
});
