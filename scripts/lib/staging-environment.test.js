const test = require("node:test");
const assert = require("node:assert/strict");

const {
  classifyMercadoPagoCredential,
  evaluateStagingEnvironment,
  evaluateWriteTarget,
} = require("./staging-environment");

const safeStagingEnv = {
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
  PRODUCTION_DB_HOST_FINGERPRINT: "2a6ebe8307c4",
  PRODUCTION_DB_NAME: "gogi_prod",
  PRODUCTION_DB_USER: "prod_writer",
  PRODUCTION_DB_USER_FINGERPRINT: "77889900aabb",
};

test("allows writes only when every staging isolation signal is present", () => {
  const summary = evaluateWriteTarget({
    operation: "scripts/seed-staging-qa.js --write",
    env: safeStagingEnv,
  });

  assert.equal(summary.writeAllowed, true);
  assert.deepEqual(summary.blockingReasons, []);
});

test("blocks contradictory staging when database name is production", () => {
  const summary = evaluateWriteTarget({
    operation: "scripts/seed-staging-qa.js --write",
    env: {
      ...safeStagingEnv,
      DATABASE_URL:
        "mysql://staging_user:pass@staging-db.example.com:3306/gogi_prod",
      DB_NAME: "gogi_prod",
    },
  });

  assert.equal(summary.writeAllowed, false);
  assert(summary.blockingReasons.includes("DATABASE_TARGETS_PRODUCTION"));
  assert(
    summary.blockingReasons.includes(
      "DATABASE_NAME_MATCHES_PRODUCTION_REFERENCE",
    ),
  );
});

test("blocks writes when host matches production reference", () => {
  const summary = evaluateWriteTarget({
    operation: "scripts/seed-staging-qa.js --write",
    env: {
      ...safeStagingEnv,
      DATABASE_URL:
        "mysql://staging_user:pass@prod-db.example.com:3306/gogi_staging",
      DB_HOST: "prod-db.example.com",
      PRODUCTION_DB_HOST: "prod-db.example.com",
      PRODUCTION_DB_HOST_FINGERPRINT: "",
    },
  });

  assert.equal(summary.writeAllowed, false);
  assert(summary.blockingReasons.includes("DATABASE_HOST_MATCHES_PRODUCTION"));
  assert(
    summary.blockingReasons.includes("ALLOW_SHARED_DB_HOST_FOR_STAGING_FALSE"),
  );
  assert.equal(summary.databaseHostMatchesProduction, true);
  assert.equal(summary.sharedHostAllowed, false);
});

test("allows gogi_staging on a shared host with isolated user and explicit flag", () => {
  const summary = evaluateWriteTarget({
    operation: "scripts/seed-staging-qa.js --write",
    env: {
      ...safeStagingEnv,
      DATABASE_URL:
        "mysql://staging_user:pass@shared-db.example.com:3306/gogi_staging",
      DB_HOST: "shared-db.example.com",
      PRODUCTION_DB_HOST: "shared-db.example.com",
      PRODUCTION_DB_HOST_FINGERPRINT: "",
      ALLOW_SHARED_DB_HOST_FOR_STAGING: "true",
    },
  });

  assert.equal(summary.writeAllowed, true);
  assert.equal(summary.hostMatchesProduction, true);
  assert.equal(summary.userMatchesProduction, false);
  assert.equal(summary.databaseHostMatchesProduction, true);
  assert.equal(summary.sharedHostAllowed, true);
  assert(!summary.blockingReasons.includes("DATABASE_HOST_MATCHES_PRODUCTION"));
});

test("blocks shared host staging without explicit shared-host flag", () => {
  const summary = evaluateWriteTarget({
    operation: "scripts/seed-staging-qa.js --write",
    env: {
      ...safeStagingEnv,
      DATABASE_URL:
        "mysql://staging_user:pass@shared-db.example.com:3306/gogi_staging",
      DB_HOST: "shared-db.example.com",
      PRODUCTION_DB_HOST: "shared-db.example.com",
      PRODUCTION_DB_HOST_FINGERPRINT: "",
      ALLOW_SHARED_DB_HOST_FOR_STAGING: "false",
    },
  });

  assert.equal(summary.writeAllowed, false);
  assert(summary.blockingReasons.includes("DATABASE_HOST_MATCHES_PRODUCTION"));
  assert(
    summary.blockingReasons.includes("ALLOW_SHARED_DB_HOST_FOR_STAGING_FALSE"),
  );
});

test("blocks gogi_prod on a shared host even when shared-host flag is enabled", () => {
  const summary = evaluateWriteTarget({
    operation: "scripts/seed-staging-qa.js --write",
    env: {
      ...safeStagingEnv,
      DATABASE_URL:
        "mysql://staging_user:pass@shared-db.example.com:3306/gogi_prod",
      DB_HOST: "shared-db.example.com",
      DB_NAME: "gogi_prod",
      PRODUCTION_DB_HOST: "shared-db.example.com",
      PRODUCTION_DB_HOST_FINGERPRINT: "",
      ALLOW_SHARED_DB_HOST_FOR_STAGING: "true",
    },
  });

  assert.equal(summary.writeAllowed, false);
  assert(summary.blockingReasons.includes("DATABASE_TARGETS_PRODUCTION"));
});

test("blocks shared-host staging when the user matches production", () => {
  const summary = evaluateWriteTarget({
    operation: "scripts/seed-staging-qa.js --write",
    env: {
      ...safeStagingEnv,
      DATABASE_URL:
        "mysql://prod_writer:pass@shared-db.example.com:3306/gogi_staging",
      DB_HOST: "shared-db.example.com",
      DB_USER: "prod_writer",
      PRODUCTION_DB_HOST: "shared-db.example.com",
      PRODUCTION_DB_HOST_FINGERPRINT: "",
      ALLOW_SHARED_DB_HOST_FOR_STAGING: "true",
    },
  });

  assert.equal(summary.writeAllowed, false);
  assert(summary.blockingReasons.includes("DATABASE_USER_MATCHES_PRODUCTION"));
});

test("blocks shared-host staging when the managed admin user is used", () => {
  const summary = evaluateWriteTarget({
    operation: "scripts/seed-staging-qa.js --write",
    env: {
      ...safeStagingEnv,
      DATABASE_URL:
        "mysql://avnadmin:pass@shared-db.example.com:3306/gogi_staging",
      DB_HOST: "shared-db.example.com",
      DB_USER: "avnadmin",
      PRODUCTION_DB_HOST: "shared-db.example.com",
      PRODUCTION_DB_HOST_FINGERPRINT: "",
      ALLOW_SHARED_DB_HOST_FOR_STAGING: "true",
    },
  });

  assert.equal(summary.writeAllowed, false);
  assert(summary.blockingReasons.includes("DATABASE_USER_MATCHES_PRODUCTION"));
});

test("evaluateStagingEnvironment allows shared host only with the explicit flag and isolated user", () => {
  const summary = evaluateStagingEnvironment({
    ...safeStagingEnv,
    DATABASE_URL:
      "mysql://staging_user:pass@shared-db.example.com:3306/gogi_staging",
    DB_HOST: "shared-db.example.com",
    PRODUCTION_DB_HOST: "shared-db.example.com",
    PRODUCTION_DB_HOST_FINGERPRINT: "",
    ALLOW_SHARED_DB_HOST_FOR_STAGING: "true",
    NEXT_PUBLIC_APP_URL: "https://preview-staging.vercel.app",
    NEXT_PUBLIC_MERCADOPAGO_PUBLIC_KEY: "APP_TEST-STAGING-PUBLIC",
    MERCADOPAGO_ACCESS_TOKEN: "APP_TEST-STAGING-ACCESS",
  });

  assert.equal(summary.hostMatchesProduction, true);
  assert.equal(summary.userMatchesProduction, false);
  assert.equal(summary.sharedHostAllowed, true);
  assert.equal(summary.verified, true);
  assert(!summary.blockingReasons.includes("DATABASE_HOST_MATCHES_PRODUCTION"));
});

test("blocks shared-host staging verification without explicit shared-host flag", () => {
  const summary = evaluateStagingEnvironment({
    ...safeStagingEnv,
    DATABASE_URL:
      "mysql://staging_user:pass@shared-db.example.com:3306/gogi_staging",
    DB_HOST: "shared-db.example.com",
    PRODUCTION_DB_HOST: "shared-db.example.com",
    PRODUCTION_DB_HOST_FINGERPRINT: "",
    NEXT_PUBLIC_APP_URL: "https://preview-staging.vercel.app",
    NEXT_PUBLIC_MERCADOPAGO_PUBLIC_KEY: "APP_TEST-STAGING-PUBLIC",
    MERCADOPAGO_ACCESS_TOKEN: "APP_TEST-STAGING-ACCESS",
  });

  assert.equal(summary.verified, false);
  assert.equal(summary.hostMatchesProduction, true);
  assert.equal(summary.sharedHostAllowed, false);
  assert(
    summary.blockingReasons.includes("ALLOW_SHARED_DB_HOST_FOR_STAGING_FALSE"),
  );
  assert(summary.blockingReasons.includes("DATABASE_HOST_MATCHES_PRODUCTION"));
});

test("blocks shared-host staging verification when the user matches production", () => {
  const summary = evaluateStagingEnvironment({
    ...safeStagingEnv,
    DATABASE_URL:
      "mysql://prod_writer:pass@shared-db.example.com:3306/gogi_staging",
    DB_HOST: "shared-db.example.com",
    DB_USER: "prod_writer",
    PRODUCTION_DB_HOST: "shared-db.example.com",
    PRODUCTION_DB_HOST_FINGERPRINT: "",
    ALLOW_SHARED_DB_HOST_FOR_STAGING: "true",
    NEXT_PUBLIC_APP_URL: "https://preview-staging.vercel.app",
    NEXT_PUBLIC_MERCADOPAGO_PUBLIC_KEY: "APP_TEST-STAGING-PUBLIC",
    MERCADOPAGO_ACCESS_TOKEN: "APP_TEST-STAGING-ACCESS",
  });

  assert.equal(summary.verified, false);
  assert.equal(summary.userMatchesProduction, true);
  assert(summary.blockingReasons.includes("DATABASE_USER_MATCHES_PRODUCTION"));
});

test("blocks shared-host staging verification when the managed admin user is used", () => {
  const summary = evaluateStagingEnvironment({
    ...safeStagingEnv,
    DATABASE_URL:
      "mysql://avnadmin:pass@shared-db.example.com:3306/gogi_staging",
    DB_HOST: "shared-db.example.com",
    DB_USER: "avnadmin",
    PRODUCTION_DB_HOST: "shared-db.example.com",
    PRODUCTION_DB_HOST_FINGERPRINT: "",
    ALLOW_SHARED_DB_HOST_FOR_STAGING: "true",
    NEXT_PUBLIC_APP_URL: "https://preview-staging.vercel.app",
    NEXT_PUBLIC_MERCADOPAGO_PUBLIC_KEY: "APP_TEST-STAGING-PUBLIC",
    MERCADOPAGO_ACCESS_TOKEN: "APP_TEST-STAGING-ACCESS",
  });

  assert.equal(summary.verified, false);
  assert.equal(summary.userMatchesProduction, true);
  assert(summary.blockingReasons.includes("DATABASE_USER_MATCHES_PRODUCTION"));
});

test("blocks writes when APP_ENV or DATABASE_ENV is missing", () => {
  const summary = evaluateWriteTarget({
    operation: "scripts/seed-staging-qa.js --write",
    env: {
      ...safeStagingEnv,
      APP_ENV: "",
      DATABASE_ENV: "",
    },
  });

  assert.equal(summary.writeAllowed, false);
  assert(summary.blockingReasons.includes("APP_ENV_NOT_STAGING_OR_TEST"));
  assert(summary.blockingReasons.includes("DATABASE_ENV_NOT_STAGING_OR_TEST"));
});

test("blocks writes when DATABASE_URL is missing or invalid", () => {
  const missingSummary = evaluateWriteTarget({
    operation: "scripts/seed-staging-qa.js --write",
    env: {
      ...safeStagingEnv,
      DATABASE_URL: "",
    },
  });
  assert.equal(missingSummary.writeAllowed, false);
  assert(missingSummary.blockingReasons.includes("DATABASE_URL_MISSING"));

  const invalidSummary = evaluateWriteTarget({
    operation: "scripts/seed-staging-qa.js --write",
    env: {
      ...safeStagingEnv,
      DATABASE_URL: "not-a-url",
    },
  });
  assert.equal(invalidSummary.writeAllowed, false);
  assert(invalidSummary.blockingReasons.includes("DATABASE_URL_INVALID"));
});

test("blocks writes when vercel or node signal indicates production", () => {
  const vercelSummary = evaluateWriteTarget({
    operation: "scripts/seed-staging-qa.js --write",
    env: {
      ...safeStagingEnv,
      VERCEL_ENV: "production",
    },
  });
  assert.equal(vercelSummary.writeAllowed, false);
  assert(vercelSummary.blockingReasons.includes("VERCEL_ENV_PRODUCTION"));

  const nodeSummary = evaluateWriteTarget({
    operation: "scripts/seed-staging-qa.js --write",
    env: {
      ...safeStagingEnv,
      NODE_ENV: "production",
      VERCEL_ENV: "preview",
    },
  });
  assert.equal(nodeSummary.writeAllowed, false);
  assert(nodeSummary.blockingReasons.includes("NODE_ENV_PRODUCTION"));

  const stagingNodeSummary = evaluateStagingEnvironment({
    ...safeStagingEnv,
    NODE_ENV: "production",
    VERCEL_ENV: "preview",
    NEXT_PUBLIC_APP_URL: "https://preview-staging.vercel.app",
    NEXT_PUBLIC_MERCADOPAGO_PUBLIC_KEY: "APP_TEST-STAGING-PUBLIC",
    MERCADOPAGO_ACCESS_TOKEN: "APP_TEST-STAGING-ACCESS",
  });
  assert.equal(stagingNodeSummary.verified, false);
  assert(stagingNodeSummary.blockingReasons.includes("NODE_ENV_PRODUCTION"));

  const stagingVercelSummary = evaluateStagingEnvironment({
    ...safeStagingEnv,
    VERCEL_ENV: "production",
    NEXT_PUBLIC_APP_URL: "https://preview-staging.vercel.app",
    NEXT_PUBLIC_MERCADOPAGO_PUBLIC_KEY: "APP_TEST-STAGING-PUBLIC",
    MERCADOPAGO_ACCESS_TOKEN: "APP_TEST-STAGING-ACCESS",
  });
  assert.equal(stagingVercelSummary.verified, false);
  assert(
    stagingVercelSummary.blockingReasons.includes("VERCEL_ENV_PRODUCTION"),
  );
});

test("blocks writes when production host reference is missing", () => {
  const summary = evaluateWriteTarget({
    operation: "scripts/seed-staging-qa.js --write",
    env: {
      ...safeStagingEnv,
      PRODUCTION_DB_HOST_FINGERPRINT: "",
      PRODUCTION_DB_HOST: "",
    },
  });

  assert.equal(summary.writeAllowed, false);
  assert(summary.blockingReasons.includes("PRODUCTION_HOST_REFERENCE_MISSING"));
});

test("blocks non allowlisted write operations", () => {
  const summary = evaluateWriteTarget({
    operation: "scripts/custom-ad-hoc-write.js",
    env: safeStagingEnv,
  });

  assert.equal(summary.writeAllowed, false);
  assert(summary.blockingReasons.includes("OPERATION_NOT_ALLOWED"));
});

test("evaluateStagingEnvironment and evaluateWriteTarget stay consistent for shared-host decisions", () => {
  const env = {
    ...safeStagingEnv,
    DATABASE_URL:
      "mysql://staging_user:pass@shared-db.example.com:3306/gogi_staging",
    DB_HOST: "shared-db.example.com",
    PRODUCTION_DB_HOST: "shared-db.example.com",
    PRODUCTION_DB_HOST_FINGERPRINT: "",
    ALLOW_SHARED_DB_HOST_FOR_STAGING: "true",
    NEXT_PUBLIC_APP_URL: "https://preview-staging.vercel.app",
    NEXT_PUBLIC_MERCADOPAGO_PUBLIC_KEY: "APP_TEST-STAGING-PUBLIC",
    MERCADOPAGO_ACCESS_TOKEN: "APP_TEST-STAGING-ACCESS",
  };

  const writeSummary = evaluateWriteTarget({
    operation: "scripts/seed-staging-qa.js --write",
    env,
  });
  const stagingSummary = evaluateStagingEnvironment(env);

  assert.equal(writeSummary.writeAllowed, true);
  assert.equal(stagingSummary.writeGuardEligible, true);
  assert.equal(writeSummary.hostMatchesProduction, true);
  assert.equal(stagingSummary.hostMatchesProduction, true);
  assert.equal(writeSummary.userMatchesProduction, false);
  assert.equal(stagingSummary.userMatchesProduction, false);
  assert.equal(writeSummary.sharedHostAllowed, true);
  assert.equal(stagingSummary.sharedHostAllowed, true);
});

test("mercado pago credentials stay unverified unless clearly test-like", () => {
  assert.equal(
    classifyMercadoPagoCredential("APP_TEST-1234567890").state,
    "test",
  );
  assert.equal(
    classifyMercadoPagoCredential("PEGA_AQUI_EL_ACCESS_TOKEN_DE_PRUEBA").state,
    "placeholder",
  );
  assert.equal(
    classifyMercadoPagoCredential("APP_USR-f80bcd88-fda4").state,
    "unknown",
  );
  assert.equal(classifyMercadoPagoCredential("").state, "missing");
});
