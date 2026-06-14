const test = require("node:test");
const assert = require("node:assert/strict");

const {
  classifyMercadoPagoCredential,
  evaluateStagingEnvironment,
  evaluateWriteTarget,
} = require("./staging-environment");

const validEnv = {
  APP_ENV: "staging",
  DATABASE_ENV: "staging",
  NODE_ENV: "development",
  VERCEL_ENV: "preview",
  ALLOW_STAGING_DB_WRITES: "true",
  DATABASE_URL:
    "mysql://staging_user:pass@staging-db.gogieats-preview.net:3306/gogi_staging",
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

test("valid isolated staging configuration is accepted", () => {
  const verify = evaluateStagingEnvironment(validEnv);
  const write = evaluateWriteTarget({
    operation: "scripts/seed-staging-qa.js --write",
    env: validEnv,
  });

  assert.equal(verify.verified, true);
  assert.deepEqual(verify.blockingReasons, []);
  assert.equal(write.writeAllowed, true);
  assert.deepEqual(write.blockingReasons, []);
});

test("blocks when APP_ENV is missing", () => {
  const summary = evaluateStagingEnvironment({
    ...validEnv,
    APP_ENV: "",
  });

  assert.equal(summary.verified, false);
  assert(summary.blockingReasons.includes("APP_ENV_NOT_STAGING_OR_TEST"));
});

test("blocks when DATABASE_ENV is missing", () => {
  const summary = evaluateStagingEnvironment({
    ...validEnv,
    DATABASE_ENV: "",
  });

  assert.equal(summary.verified, false);
  assert(summary.blockingReasons.includes("DATABASE_ENV_NOT_STAGING_OR_TEST"));
});

test("blocks when DATABASE_URL is missing", () => {
  const summary = evaluateStagingEnvironment({
    ...validEnv,
    DATABASE_URL: "",
  });

  assert.equal(summary.verified, false);
  assert(summary.blockingReasons.includes("DATABASE_URL_MISSING"));
});

test("blocks when DATABASE_URL is invalid", () => {
  const summary = evaluateStagingEnvironment({
    ...validEnv,
    DATABASE_URL: "not-a-url",
  });

  assert.equal(summary.verified, false);
  assert(summary.blockingReasons.includes("DATABASE_URL_INVALID"));
});

test("blocks when VERCEL_ENV indicates production", () => {
  const summary = evaluateStagingEnvironment({
    ...validEnv,
    VERCEL_ENV: "production",
  });

  assert.equal(summary.verified, false);
  assert(summary.blockingReasons.includes("VERCEL_ENV_PRODUCTION"));
});

test("blocks when NODE_ENV indicates production", () => {
  const summary = evaluateStagingEnvironment({
    ...validEnv,
    NODE_ENV: "production",
  });

  assert.equal(summary.verified, false);
  assert(summary.blockingReasons.includes("NODE_ENV_PRODUCTION"));
});

test("blocks when production host reference is missing", () => {
  const summary = evaluateStagingEnvironment({
    ...validEnv,
    PRODUCTION_DB_HOST: "",
    PRODUCTION_DB_HOST_FINGERPRINT: "",
    PRODUCTION_DB_USER: "",
    PRODUCTION_DB_USER_FINGERPRINT: "",
    PRODUCTION_DB_NAME: "",
  });

  assert.equal(summary.verified, false);
  assert(summary.blockingReasons.includes("PRODUCTION_HOST_REFERENCE_MISSING"));
});

test("placeholder production references are rejected", () => {
  const summary = evaluateStagingEnvironment({
    ...validEnv,
    PRODUCTION_DB_HOST_FINGERPRINT: "REPLACE_WITH_CALCULATED_VALUE",
    PRODUCTION_DB_USER_FINGERPRINT: "REPLACE_WITH_CALCULATED_VALUE",
    PRODUCTION_DB_USER: "PEGA_AQUI_EL_USUARIO_REAL_DE_PRODUCCION",
  });

  assert.equal(summary.verified, false);
  assert(
    summary.blockingReasons.includes("PRODUCTION_HOST_FINGERPRINT_INVALID"),
  );
  assert(
    summary.blockingReasons.includes("PRODUCTION_USER_FINGERPRINT_INVALID"),
  );
});

test("invalid production fingerprint format is rejected", () => {
  const summary = evaluateStagingEnvironment({
    ...validEnv,
    PRODUCTION_DB_HOST_FINGERPRINT: "short",
  });

  assert.equal(summary.verified, false);
  assert(
    summary.blockingReasons.includes("PRODUCTION_HOST_FINGERPRINT_INVALID"),
  );
});

test("empty production reference is rejected", () => {
  const summary = evaluateStagingEnvironment({
    ...validEnv,
    PRODUCTION_DB_HOST_FINGERPRINT: "",
    PRODUCTION_DB_HOST: "",
    PRODUCTION_DB_USER: "",
    PRODUCTION_DB_USER_FINGERPRINT: "",
    PRODUCTION_DB_NAME: "",
  });

  assert.equal(summary.verified, false);
  assert(summary.blockingReasons.includes("PRODUCTION_HOST_REFERENCE_MISSING"));
});

test("gogi_prod is always blocked as a write target", () => {
  const summary = evaluateWriteTarget({
    operation: "scripts/seed-staging-qa.js --write",
    env: {
      ...validEnv,
      DATABASE_URL:
        "mysql://staging_user:pass@staging-db.gogieats-preview.net:3306/gogi_prod",
      DB_NAME: "gogi_prod",
    },
  });

  assert.equal(summary.writeAllowed, false);
  assert(summary.blockingReasons.includes("DATABASE_TARGETS_PRODUCTION"));
});

test("same host and same database is rejected", () => {
  const summary = evaluateStagingEnvironment({
    ...validEnv,
    DATABASE_URL:
      "mysql://staging_user:pass@shared-db.gogieats-preview.net:3306/gogi_prod",
    DB_HOST: "shared-db.gogieats-preview.net",
    DB_NAME: "gogi_prod",
    PRODUCTION_DB_HOST: "shared-db.gogieats-preview.net",
    PRODUCTION_DB_HOST_FINGERPRINT: "",
  });

  assert.equal(summary.verified, false);
  assert(summary.blockingReasons.includes("DATABASE_NAME_IS_PRODUCTION"));
  assert(
    summary.blockingReasons.includes(
      "DATABASE_NAME_MATCHES_PRODUCTION_REFERENCE",
    ),
  );
  assert(summary.blockingReasons.includes("DATABASE_HOST_MATCHES_PRODUCTION"));
});

test("same host with a different database but unverifiable user stays rejected", () => {
  const summary = evaluateStagingEnvironment({
    ...validEnv,
    DATABASE_URL:
      "mysql://staging_user:pass@shared-db.gogieats-preview.net:3306/gogi_staging",
    DB_HOST: "shared-db.gogieats-preview.net",
    PRODUCTION_DB_HOST: "shared-db.gogieats-preview.net",
    PRODUCTION_DB_HOST_FINGERPRINT: "",
    PRODUCTION_DB_USER: "PEGA_AQUI_EL_USUARIO_REAL_DE_PRODUCCION",
    PRODUCTION_DB_USER_FINGERPRINT: "",
    ALLOW_SHARED_DB_HOST_FOR_STAGING: "true",
  });

  assert.equal(summary.verified, false);
  assert.equal(summary.hostMatchesProduction, true);
  assert.equal(summary.userMatchesProduction, false);
  assert(summary.blockingReasons.includes("SHARED_HOST_USER_NOT_VERIFIABLE"));
  assert(
    summary.blockingReasons.includes(
      "SHARED_DB_HOST_REQUIRES_VERIFIED_PERMISSION_SCOPE",
    ),
  );
});

test("shared host with compensating controls remains rejected by policy", () => {
  const summary = evaluateStagingEnvironment({
    ...validEnv,
    DATABASE_URL:
      "mysql://staging_user:pass@shared-db.gogieats-preview.net:3306/gogi_staging",
    DB_HOST: "shared-db.gogieats-preview.net",
    PRODUCTION_DB_HOST: "shared-db.gogieats-preview.net",
    PRODUCTION_DB_HOST_FINGERPRINT: "",
    ALLOW_SHARED_DB_HOST_FOR_STAGING: "true",
  });

  assert.equal(summary.verified, false);
  assert.equal(summary.hostMatchesProduction, true);
  assert.equal(summary.sharedHostAllowed, false);
  assert(
    summary.blockingReasons.includes(
      "SHARED_DB_HOST_REQUIRES_VERIFIED_PERMISSION_SCOPE",
    ),
  );
});

test("shared host with apparently different user still fails when production reference is not reliable", () => {
  const summary = evaluateStagingEnvironment({
    ...validEnv,
    DATABASE_URL:
      "mysql://another_staging_user:pass@shared-db.gogieats-preview.net:3306/gogi_staging",
    DB_HOST: "shared-db.gogieats-preview.net",
    DB_USER: "another_staging_user",
    PRODUCTION_DB_HOST: "shared-db.gogieats-preview.net",
    PRODUCTION_DB_HOST_FINGERPRINT: "REPLACE_WITH_CALCULATED_VALUE",
    PRODUCTION_DB_USER: "prod_writer",
    PRODUCTION_DB_USER_FINGERPRINT: "",
    ALLOW_SHARED_DB_HOST_FOR_STAGING: "true",
  });

  assert.equal(summary.verified, false);
  assert.equal(summary.hostMatchesProduction, true);
  assert(
    summary.blockingReasons.includes("PRODUCTION_HOST_FINGERPRINT_INVALID"),
  );
});

test("classifies Mercado Pago missing credentials as missing", () => {
  assert.equal(classifyMercadoPagoCredential("").state, "missing");
});

test("classifies Mercado Pago placeholder credentials as placeholder", () => {
  assert.equal(
    classifyMercadoPagoCredential("PEGA_AQUI_EL_ACCESS_TOKEN_DE_PRUEBA").state,
    "placeholder",
  );
});

test("classifies Mercado Pago unknown credentials as unknown", () => {
  assert.equal(
    classifyMercadoPagoCredential("live-looking-but-unclassified-token").state,
    "unknown",
  );
});

test("classifies Mercado Pago test credentials as test", () => {
  assert.equal(
    classifyMercadoPagoCredential("TEST-access-1234567890").state,
    "test",
  );
});

test("mercado pago placeholder credentials are rejected", () => {
  const summary = evaluateStagingEnvironment({
    ...validEnv,
    NEXT_PUBLIC_MERCADOPAGO_PUBLIC_KEY: "PEGA_AQUI_LA_PUBLIC_KEY_DE_PRUEBA",
    MERCADOPAGO_ACCESS_TOKEN: "PEGA_AQUI_EL_ACCESS_TOKEN_DE_PRUEBA",
  });

  assert.equal(summary.verified, false);
  assert.equal(
    classifyMercadoPagoCredential("APP_TEST-STAGING-PUBLIC").state,
    "placeholder",
  );
  assert(
    summary.blockingReasons.includes(
      "MERCADOPAGO_PUBLIC_KEY_NOT_VERIFIED_AS_TEST",
    ),
  );
  assert(
    summary.blockingReasons.includes(
      "MERCADOPAGO_ACCESS_TOKEN_NOT_VERIFIED_AS_TEST",
    ),
  );
});

test("mercado pago production credentials are rejected in staging", () => {
  const summary = evaluateStagingEnvironment({
    ...validEnv,
    NEXT_PUBLIC_MERCADOPAGO_PUBLIC_KEY: "APP_USR-prod-public",
    MERCADOPAGO_ACCESS_TOKEN: "APP_USR-prod-access",
  });

  assert.equal(summary.verified, false);
  assert.equal(
    classifyMercadoPagoCredential("APP_USR-prod-public").state,
    "production",
  );
  assert(
    summary.blockingReasons.includes(
      "MERCADOPAGO_PUBLIC_KEY_NOT_VERIFIED_AS_TEST",
    ),
  );
  assert(
    summary.blockingReasons.includes(
      "MERCADOPAGO_ACCESS_TOKEN_NOT_VERIFIED_AS_TEST",
    ),
  );
});

test("mercado pago unknown credentials are rejected in staging", () => {
  const summary = evaluateStagingEnvironment({
    ...validEnv,
    NEXT_PUBLIC_MERCADOPAGO_PUBLIC_KEY: "custom-public-token",
    MERCADOPAGO_ACCESS_TOKEN: "custom-access-token",
  });

  assert.equal(summary.verified, false);
  assert(
    summary.blockingReasons.includes(
      "MERCADOPAGO_PUBLIC_KEY_NOT_VERIFIED_AS_TEST",
    ),
  );
  assert(
    summary.blockingReasons.includes(
      "MERCADOPAGO_ACCESS_TOKEN_NOT_VERIFIED_AS_TEST",
    ),
  );
});

test("mercado pago missing credentials are rejected in staging", () => {
  const summary = evaluateStagingEnvironment({
    ...validEnv,
    NEXT_PUBLIC_MERCADOPAGO_PUBLIC_KEY: "",
    MERCADOPAGO_ACCESS_TOKEN: "",
  });

  assert.equal(summary.verified, false);
  assert.equal(summary.mercadoPagoPublicKeyState, "missing");
  assert.equal(summary.mercadoPagoAccessTokenState, "missing");
});

test("placeholder app url is blocked", () => {
  const summary = evaluateStagingEnvironment({
    ...validEnv,
    NEXT_PUBLIC_APP_URL: "https://PEGA_AQUI_TU_PREVIEW.vercel.app",
  });

  assert.equal(summary.verified, false);
  assert(summary.blockingReasons.includes("APP_URL_PLACEHOLDER"));
});

test("placeholder and production app urls are rejected", () => {
  const placeholderSummary = evaluateStagingEnvironment({
    ...validEnv,
    NEXT_PUBLIC_APP_URL: "https://PEGA_AQUI_TU_PREVIEW.vercel.app",
  });
  assert.equal(placeholderSummary.verified, false);
  assert(placeholderSummary.blockingReasons.includes("APP_URL_PLACEHOLDER"));

  const productionSummary = evaluateStagingEnvironment({
    ...validEnv,
    NEXT_PUBLIC_APP_URL: "https://www.gogieats.shop",
  });
  assert.equal(productionSummary.verified, false);
  assert(
    productionSummary.blockingReasons.includes("APP_URL_POINTS_TO_PRODUCTION"),
  );
});

test("localhost url is blocked", () => {
  const localhostSummary = evaluateStagingEnvironment({
    ...validEnv,
    NEXT_PUBLIC_APP_URL: "http://localhost:3000",
  });

  assert.equal(localhostSummary.verified, false);
  assert(localhostSummary.blockingReasons.includes("APP_URL_LOCALHOST"));
});

test("non-https url is blocked", () => {
  const httpSummary = evaluateStagingEnvironment({
    ...validEnv,
    NEXT_PUBLIC_APP_URL: "http://gogi-staging-preview-12345.vercel.app",
  });

  assert.equal(httpSummary.verified, false);
  assert(httpSummary.blockingReasons.includes("APP_URL_NOT_HTTPS"));
});

test("real https staging url is accepted", () => {
  const summary = evaluateStagingEnvironment({
    ...validEnv,
    NEXT_PUBLIC_APP_URL: "https://gogi-staging-preview-67890.vercel.app",
  });

  assert.equal(summary.verified, true);
});

test("blocks when write operation is not allowlisted", () => {
  const summary = evaluateWriteTarget({
    operation: "scripts/custom-ad-hoc-write.js",
    env: validEnv,
  });

  assert.equal(summary.writeAllowed, false);
  assert(summary.blockingReasons.includes("OPERATION_NOT_ALLOWED"));
});

test("write target and staging verification stay consistent for shared-host decisions", () => {
  const env = {
    ...validEnv,
    DATABASE_URL:
      "mysql://staging_user:pass@shared-db.gogieats-preview.net:3306/gogi_staging",
    DB_HOST: "shared-db.gogieats-preview.net",
    PRODUCTION_DB_HOST: "shared-db.gogieats-preview.net",
    PRODUCTION_DB_HOST_FINGERPRINT: "",
    ALLOW_SHARED_DB_HOST_FOR_STAGING: "true",
  };

  const writeSummary = evaluateWriteTarget({
    operation: "scripts/seed-staging-qa.js --write",
    env,
  });
  const stagingSummary = evaluateStagingEnvironment(env);

  assert.equal(writeSummary.writeAllowed, false);
  assert.equal(stagingSummary.verified, false);
  assert.equal(writeSummary.hostMatchesProduction, true);
  assert.equal(stagingSummary.hostMatchesProduction, true);
  assert.equal(writeSummary.sharedHostAllowed, false);
  assert.equal(stagingSummary.sharedHostAllowed, false);
  assert(
    writeSummary.blockingReasons.includes(
      "SHARED_DB_HOST_REQUIRES_VERIFIED_PERMISSION_SCOPE",
    ),
  );
});

test("write target blocks shared host even with the explicit flag", () => {
  const summary = evaluateWriteTarget({
    operation: "scripts/seed-staging-qa.js --write",
    env: {
      ...validEnv,
      DATABASE_URL:
        "mysql://staging_user:pass@shared-db.gogieats-preview.net:3306/gogi_staging",
      DB_HOST: "shared-db.gogieats-preview.net",
      PRODUCTION_DB_HOST: "shared-db.gogieats-preview.net",
      PRODUCTION_DB_HOST_FINGERPRINT: "",
      ALLOW_SHARED_DB_HOST_FOR_STAGING: "true",
    },
  });

  assert.equal(summary.writeAllowed, false);
  assert(summary.blockingReasons.includes("DATABASE_HOST_MATCHES_PRODUCTION"));
  assert(
    summary.blockingReasons.includes(
      "SHARED_DB_HOST_REQUIRES_VERIFIED_PERMISSION_SCOPE",
    ),
  );
});
