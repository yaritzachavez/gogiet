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
    "mysql://staging_user:super-secret-password@staging-db.gogieats-preview.net:3306/gogi_staging",
  DB_NAME: "gogi_staging",
  DB_HOST: "staging-db.gogieats-preview.net",
  DB_USER: "staging_user",
  PRODUCTION_DB_HOST_FINGERPRINT: "2a6ebe8307c4",
  PRODUCTION_DB_NAME: "gogi_prod",
  PRODUCTION_DB_USER: "prod_writer",
  PRODUCTION_DB_USER_FINGERPRINT: "77889900aabb",
  NEXT_PUBLIC_APP_URL: "https://gogi-staging-preview-12345.vercel.app",
  NEXT_PUBLIC_MERCADOPAGO_PUBLIC_KEY: "TEST-public-1234567890",
  MERCADOPAGO_ACCESS_TOKEN: "TEST-access-1234567890",
};

test("returns verified only for a fully isolated valid configuration", () => {
  const output = formatVerificationOutput(verifiedEnv);

  assert.equal(output.result, "STAGING ENVIRONMENT VERIFIED");
  assert.equal(output.databaseName, "gogi_staging");
  assert.equal(output.hostMatchesProduction, false);
  assert.equal(output.mercadoPagoPublicKeyState, "test");
  assert.equal(output.mercadoPagoAccessTokenState, "test");
});

test("returns not verified when app url points to production", () => {
  const output = formatVerificationOutput({
    ...verifiedEnv,
    NEXT_PUBLIC_APP_URL: "https://www.gogieats.shop",
  });

  assert.equal(output.result, "STAGING ENVIRONMENT NOT VERIFIED");
  assert(output.blockingReasons.includes("APP_URL_POINTS_TO_PRODUCTION"));
});

test("returns not verified when Mercado Pago is ambiguous or unknown", () => {
  const output = formatVerificationOutput({
    ...verifiedEnv,
    NEXT_PUBLIC_MERCADOPAGO_PUBLIC_KEY: "custom-public-token",
    MERCADOPAGO_ACCESS_TOKEN: "custom-access-token",
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

test("returns not verified when Mercado Pago contains placeholders", () => {
  const output = formatVerificationOutput({
    ...verifiedEnv,
    NEXT_PUBLIC_MERCADOPAGO_PUBLIC_KEY: "PEGA_AQUI_LA_PUBLIC_KEY_DE_PRUEBA",
    MERCADOPAGO_ACCESS_TOKEN: "PEGA_AQUI_EL_ACCESS_TOKEN_DE_PRUEBA",
  });

  assert.equal(output.result, "STAGING ENVIRONMENT NOT VERIFIED");
  assert.equal(output.mercadoPagoPublicKeyState, "placeholder");
  assert.equal(output.mercadoPagoAccessTokenState, "placeholder");
});

test("returns not verified when production references are invalid", () => {
  const output = formatVerificationOutput({
    ...verifiedEnv,
    PRODUCTION_DB_HOST_FINGERPRINT: "REPLACE_WITH_CALCULATED_VALUE",
    PRODUCTION_DB_USER_FINGERPRINT: "REPLACE_WITH_CALCULATED_VALUE",
  });

  assert.equal(output.result, "STAGING ENVIRONMENT NOT VERIFIED");
  assert(
    output.blockingReasons.includes("PRODUCTION_HOST_FINGERPRINT_INVALID"),
  );
  assert(
    output.blockingReasons.includes("PRODUCTION_USER_FINGERPRINT_INVALID"),
  );
});

test("returns not verified for shared host without verifiable permission scope", () => {
  const output = formatVerificationOutput({
    ...verifiedEnv,
    DATABASE_URL:
      "mysql://staging_user:super-secret-password@shared-db.gogieats-preview.net:3306/gogi_staging",
    DB_HOST: "shared-db.gogieats-preview.net",
    PRODUCTION_DB_HOST: "shared-db.gogieats-preview.net",
    PRODUCTION_DB_HOST_FINGERPRINT: "",
    ALLOW_SHARED_DB_HOST_FOR_STAGING: "true",
  });

  assert.equal(output.result, "STAGING ENVIRONMENT NOT VERIFIED");
  assert.equal(output.hostMatchesProduction, true);
  assert(
    output.blockingReasons.includes(
      "SHARED_DB_HOST_REQUIRES_VERIFIED_PERMISSION_SCOPE",
    ),
  );
});

test("verification output keeps blocking reasons deterministic", () => {
  const output = formatVerificationOutput({
    ...verifiedEnv,
    NEXT_PUBLIC_APP_URL: "https://PEGA_AQUI_TU_PREVIEW.vercel.app",
    NEXT_PUBLIC_MERCADOPAGO_PUBLIC_KEY: "PEGA_AQUI_LA_PUBLIC_KEY_DE_PRUEBA",
    MERCADOPAGO_ACCESS_TOKEN: "PEGA_AQUI_EL_ACCESS_TOKEN_DE_PRUEBA",
  });

  assert.deepEqual(output.blockingReasons, [
    "APP_URL_PLACEHOLDER",
    "MERCADOPAGO_PUBLIC_KEY_NOT_VERIFIED_AS_TEST",
    "MERCADOPAGO_ACCESS_TOKEN_NOT_VERIFIED_AS_TEST",
  ]);
});

test("verification output redacts secrets and only exposes safe classifications", () => {
  const output = formatVerificationOutput(verifiedEnv);

  assert.equal(output.databaseHost, "stag***.net");
  assert.equal(output.mercadoPagoPublicKeyState, "test");
  assert.equal(output.mercadoPagoAccessTokenState, "test");
  assert.equal(output.databaseUrlPresent, true);
  assert.equal(
    output.databaseHost.includes("staging-db.gogieats-preview.net"),
    false,
  );
  assert.equal(JSON.stringify(output).includes("super-secret-password"), false);
  assert.equal(
    JSON.stringify(output).includes("TEST-access-1234567890"),
    false,
  );
});
