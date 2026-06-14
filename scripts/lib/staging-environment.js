const crypto = require("node:crypto");

const STAGING_RUNTIME_ENVIRONMENTS = new Set(["staging", "test"]);
const PRODUCTION_DATABASE_NAMES = new Set(["gogi_prod", "production"]);
const PRODUCTION_APP_HOSTNAMES = new Set([
  "gogieats.shop",
  "www.gogieats.shop",
]);
const PLACEHOLDER_TOKENS = [
  "placeholder",
  "replace-me",
  "replace_me",
  "replace_with",
  "replacewith",
  "changeme",
  "change-me",
  "example",
  "todo",
  "unknown",
  "pega_aqui",
  "your_",
];
const KNOWN_FAKE_MERCADOPAGO_TEST_VALUES = new Set([
  "APP_TEST-STAGING-PUBLIC",
  "APP_TEST-STAGING-ACCESS",
]);
const ALLOWED_WRITE_OPERATIONS = new Set([
  "prisma/seed.js",
  "scripts/activate-verified-users.js --apply",
  "scripts/business-ownership-repair.js --write",
  "scripts/cleanup-business-owners.js --apply",
  "scripts/cleanup-test-stores-products.ts confirmed cleanup",
  "scripts/ensure-business-owners-table.js",
  "scripts/repair-business-relations.js --apply",
  "scripts/seed-products.js",
  "scripts/seed-staging-qa.js --write",
  "scripts/cleanup-staging-qa.js --write",
]);
const FORBIDDEN_SHARED_HOST_USERS = new Set(["avnadmin"]);

function normalizeEnvToken(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase();
}

function normalizeOptionalValue(value) {
  const normalized = String(value ?? "").trim();
  return normalized === "" ? null : normalized;
}

function hasPlaceholderToken(value) {
  const normalized = normalizeEnvToken(value);
  if (!normalized) {
    return false;
  }

  return PLACEHOLDER_TOKENS.some((token) => normalized.includes(token));
}

function hasReasonableLength(value, minLength = 6) {
  return String(value ?? "").trim().length >= minLength;
}

function isReliableReferenceValue(value, minLength = 4) {
  const normalized = normalizeOptionalValue(value);
  return Boolean(
    normalized &&
      hasReasonableLength(normalized, minLength) &&
      !hasPlaceholderToken(normalized),
  );
}

function isValidFingerprint(value) {
  const normalized = normalizeOptionalValue(value);
  return Boolean(
    normalized &&
      !hasPlaceholderToken(normalized) &&
      /^[a-f0-9]{12,64}$/i.test(normalized),
  );
}

function maskHost(host) {
  if (!host) {
    return null;
  }

  if (host.length <= 4) {
    return `***${host}`;
  }

  return `${host.slice(0, 4)}***${host.slice(-4)}`;
}

function createFingerprint(value) {
  if (!value) {
    return null;
  }

  return crypto
    .createHash("sha256")
    .update(String(value))
    .digest("hex")
    .slice(0, 12);
}

function redactReferenceEdge(value) {
  const normalized = normalizeOptionalValue(value);
  if (!normalized) {
    return null;
  }

  if (normalized.length <= 8) {
    return `${normalized.slice(0, 2)}...${normalized.slice(-2)}`;
  }

  return `${normalized.slice(0, 4)}...${normalized.slice(-4)}`;
}

function parseUrlTarget(rawUrl) {
  if (!rawUrl) {
    return {
      parseError: "DATABASE_URL_MISSING",
      host: null,
      databaseName: null,
      user: null,
      parsed: null,
    };
  }

  try {
    const parsed = new URL(rawUrl);
    return {
      parseError: null,
      host: parsed.hostname || null,
      databaseName: parsed.pathname.replace(/^\//, "") || null,
      user: parsed.username ? decodeURIComponent(parsed.username) : null,
      parsed,
    };
  } catch {
    return {
      parseError: "DATABASE_URL_INVALID",
      host: null,
      databaseName: null,
      user: null,
      parsed: null,
    };
  }
}

function getRuntimeEnvironment(env = process.env) {
  const nodeEnv = normalizeEnvToken(env.NODE_ENV);
  const vercelEnv = normalizeEnvToken(env.VERCEL_ENV);
  const appEnv = normalizeEnvToken(env.APP_ENV);
  const databaseEnv = normalizeEnvToken(env.DATABASE_ENV);

  if (vercelEnv === "preview" || appEnv === "preview") {
    return "preview";
  }

  if (
    nodeEnv === "production" ||
    vercelEnv === "production" ||
    appEnv === "production" ||
    databaseEnv === "production"
  ) {
    return "production";
  }

  return "development";
}

function parseDatabaseTarget(env = process.env) {
  const rawUrl = normalizeOptionalValue(env.DATABASE_URL);
  const parsedUrl = parseUrlTarget(rawUrl);
  const host = parsedUrl.host || normalizeOptionalValue(env.DB_HOST);
  const databaseName =
    parsedUrl.databaseName || normalizeOptionalValue(env.DB_NAME);
  const user = parsedUrl.user || normalizeOptionalValue(env.DB_USER);

  return {
    rawUrl,
    rawUrlLower: rawUrl ? rawUrl.toLowerCase() : "",
    parseError: parsedUrl.parseError,
    host,
    databaseName,
    user,
    hostFingerprint: createFingerprint(host),
    userFingerprint: createFingerprint(user),
    rawUrlPresent: Boolean(rawUrl),
    rawUrlParseable: parsedUrl.parseError == null,
  };
}

function getProductionReference(env = process.env) {
  const productionDatabaseUrl = normalizeOptionalValue(
    env.PRODUCTION_DATABASE_URL,
  );
  const parsedProductionUrl = parseUrlTarget(productionDatabaseUrl);
  const explicitHost = normalizeOptionalValue(env.PRODUCTION_DB_HOST);
  const explicitDatabaseName = normalizeOptionalValue(env.PRODUCTION_DB_NAME);
  const explicitUser = normalizeOptionalValue(env.PRODUCTION_DB_USER);
  const explicitHostFingerprint = normalizeOptionalValue(
    env.PRODUCTION_DB_HOST_FINGERPRINT,
  );
  const explicitUserFingerprint = normalizeOptionalValue(
    env.PRODUCTION_DB_USER_FINGERPRINT,
  );
  const parsedUrlIsReliable =
    Boolean(productionDatabaseUrl) &&
    parsedProductionUrl.parseError == null &&
    !hasPlaceholderToken(productionDatabaseUrl);
  const host = explicitHost || parsedProductionUrl.host;
  const databaseName = explicitDatabaseName || parsedProductionUrl.databaseName;
  const user = explicitUser || parsedProductionUrl.user;
  const hostFingerprint = explicitHostFingerprint;
  const userFingerprint = explicitUserFingerprint;
  const hostReliable = explicitHost
    ? isReliableReferenceValue(explicitHost, 8)
    : parsedUrlIsReliable &&
      isReliableReferenceValue(parsedProductionUrl.host, 8);
  const databaseNameReliable = explicitDatabaseName
    ? isReliableReferenceValue(explicitDatabaseName, 4)
    : parsedUrlIsReliable &&
      isReliableReferenceValue(parsedProductionUrl.databaseName, 4);
  const userReliable = explicitUser
    ? isReliableReferenceValue(explicitUser, 4)
    : parsedUrlIsReliable &&
      isReliableReferenceValue(parsedProductionUrl.user, 4);
  const hostFingerprintReliable = isValidFingerprint(explicitHostFingerprint);
  const userFingerprintReliable = isValidFingerprint(explicitUserFingerprint);

  return {
    host,
    hostFingerprint,
    databaseName,
    user,
    userFingerprint,
    hostReliable,
    databaseNameReliable,
    userReliable,
    hostFingerprintReliable,
    userFingerprintReliable,
    parsedUrlIsReliable,
    configured: Boolean(
      hostReliable ||
        databaseNameReliable ||
        userReliable ||
        hostFingerprintReliable ||
        userFingerprintReliable,
    ),
  };
}

function getEnvironmentSignals(env = process.env) {
  const appEnv = normalizeEnvToken(env.APP_ENV);
  const databaseEnv = normalizeEnvToken(env.DATABASE_ENV);
  const nodeEnv = normalizeEnvToken(env.NODE_ENV);
  const vercelEnv = normalizeEnvToken(env.VERCEL_ENV);

  return {
    appEnv,
    databaseEnv,
    nodeEnv,
    vercelEnv,
    runtimeEnvironment: getRuntimeEnvironment(env),
    allowStagingWrites:
      normalizeEnvToken(env.ALLOW_STAGING_DB_WRITES) === "true",
    allowSharedDbHostForStaging:
      normalizeEnvToken(env.ALLOW_SHARED_DB_HOST_FOR_STAGING) === "true",
  };
}

function isAllowedWriteOperation(operation) {
  return ALLOWED_WRITE_OPERATIONS.has(String(operation ?? "").trim());
}

function classifyMercadoPagoCredential(value) {
  const normalized = normalizeOptionalValue(value);
  if (!normalized) {
    return {
      state: "missing",
      fingerprint: null,
    };
  }

  if (
    hasPlaceholderToken(normalized) ||
    KNOWN_FAKE_MERCADOPAGO_TEST_VALUES.has(normalized)
  ) {
    return {
      state: "placeholder",
      fingerprint: createFingerprint(normalized),
    };
  }

  if (/^APP_USR-/i.test(normalized)) {
    return {
      state: "production",
      fingerprint: createFingerprint(normalized),
    };
  }

  if (
    /^TEST-/i.test(normalized) ||
    /^MPTEST-/i.test(normalized) ||
    /sandbox/i.test(normalized) ||
    /test/i.test(normalized)
  ) {
    return {
      state: "test",
      fingerprint: createFingerprint(normalized),
    };
  }

  return {
    state: "unknown",
    fingerprint: createFingerprint(normalized),
  };
}

function analyzeAppUrl(env = process.env) {
  const rawUrl =
    normalizeOptionalValue(env.NEXT_PUBLIC_APP_URL) ||
    normalizeOptionalValue(env.APP_URL);

  if (!rawUrl) {
    return {
      rawUrl: null,
      parseError: "APP_URL_MISSING",
      hostname: null,
      maskedHost: null,
      fingerprint: null,
      isProductionHostname: false,
      isPreviewHostname: false,
    };
  }

  try {
    const parsed = new URL(rawUrl);
    const hostname = parsed.hostname || null;
    return {
      rawUrl,
      parseError: null,
      hostname,
      maskedHost: maskHost(hostname),
      fingerprint: createFingerprint(hostname),
      isHttps: parsed.protocol === "https:",
      isLocalhost: Boolean(
        hostname &&
          ["localhost", "127.0.0.1", "::1"].includes(hostname.toLowerCase()),
      ),
      isPlaceholderHostname: hasPlaceholderToken(hostname),
      isProductionHostname: Boolean(
        hostname && PRODUCTION_APP_HOSTNAMES.has(hostname.toLowerCase()),
      ),
      isPreviewHostname: Boolean(hostname?.endsWith(".vercel.app")),
    };
  } catch {
    return {
      rawUrl,
      parseError: "APP_URL_INVALID",
      hostname: null,
      maskedHost: null,
      fingerprint: createFingerprint(rawUrl),
      isHttps: false,
      isLocalhost: false,
      isPlaceholderHostname: hasPlaceholderToken(rawUrl),
      isProductionHostname: false,
      isPreviewHostname: false,
    };
  }
}

function isExactStagingDatabaseName(databaseName) {
  return normalizeEnvToken(databaseName) === "gogi_staging";
}

function isForbiddenSharedHostUser(databaseTarget, productionReference) {
  const normalizedUser = normalizeEnvToken(databaseTarget.user);

  if (!normalizedUser) {
    return false;
  }

  if (FORBIDDEN_SHARED_HOST_USERS.has(normalizedUser)) {
    return true;
  }

  if (
    productionReference.userReliable &&
    productionReference.user &&
    normalizedUser === normalizeEnvToken(productionReference.user)
  ) {
    return true;
  }

  return Boolean(
    productionReference.userFingerprintReliable &&
      productionReference.userFingerprint &&
      databaseTarget.userFingerprint &&
      productionReference.userFingerprint === databaseTarget.userFingerprint,
  );
}

function getSharedHostStatus({
  operation,
  signals,
  databaseTarget,
  productionReference,
}) {
  return {
    requested: signals.allowSharedDbHostForStaging,
    operationAllowed: isAllowedWriteOperation(operation),
    exactStagingDatabaseName: isExactStagingDatabaseName(
      databaseTarget.databaseName,
    ),
    productionHostTrusted: Boolean(
      productionReference.hostReliable ||
        productionReference.hostFingerprintReliable,
    ),
    productionUserTrusted: Boolean(
      productionReference.userReliable ||
        productionReference.userFingerprintReliable,
    ),
    permissionScopeVerifiable: false,
    eligible: false,
  };
}

function evaluateWriteTarget({
  operation,
  env = process.env,
  requireExplicitFlag = true,
}) {
  const normalizedOperation = String(operation ?? "").trim();
  const signals = getEnvironmentSignals(env);
  const databaseTarget = parseDatabaseTarget(env);
  const productionReference = getProductionReference(env);
  const reasons = [];

  if (!normalizedOperation || !isAllowedWriteOperation(normalizedOperation)) {
    reasons.push("OPERATION_NOT_ALLOWED");
  }

  if (!STAGING_RUNTIME_ENVIRONMENTS.has(signals.appEnv)) {
    reasons.push("APP_ENV_NOT_STAGING_OR_TEST");
  }

  if (!STAGING_RUNTIME_ENVIRONMENTS.has(signals.databaseEnv)) {
    reasons.push("DATABASE_ENV_NOT_STAGING_OR_TEST");
  }

  if (requireExplicitFlag && !signals.allowStagingWrites) {
    reasons.push("ALLOW_STAGING_DB_WRITES_FALSE");
  }

  if (signals.vercelEnv === "production") {
    reasons.push("VERCEL_ENV_PRODUCTION");
  }

  if (signals.nodeEnv === "production") {
    reasons.push("NODE_ENV_PRODUCTION");
  }

  if (!databaseTarget.rawUrlPresent) {
    reasons.push("DATABASE_URL_MISSING");
  }

  if (!databaseTarget.rawUrlParseable) {
    reasons.push(databaseTarget.parseError || "DATABASE_URL_INVALID");
  }

  if (!databaseTarget.databaseName) {
    reasons.push("DATABASE_NAME_MISSING");
  }

  if (!databaseTarget.host) {
    reasons.push("DATABASE_HOST_MISSING");
  }

  const databaseNameLower = normalizeEnvToken(databaseTarget.databaseName);
  if (
    PRODUCTION_DATABASE_NAMES.has(databaseNameLower) ||
    databaseTarget.rawUrlLower.includes("gogi_prod")
  ) {
    reasons.push("DATABASE_TARGETS_PRODUCTION");
  }

  if (!productionReference.configured) {
    reasons.push("PRODUCTION_HOST_REFERENCE_MISSING");
  }

  if (
    productionReference.hostFingerprint &&
    !productionReference.hostFingerprintReliable
  ) {
    reasons.push("PRODUCTION_HOST_FINGERPRINT_INVALID");
  }

  if (
    productionReference.userFingerprint &&
    !productionReference.userFingerprintReliable
  ) {
    reasons.push("PRODUCTION_USER_FINGERPRINT_INVALID");
  }

  const databaseHostMatchesProduction = Boolean(
    databaseTarget.host &&
      ((productionReference.hostReliable &&
        productionReference.host &&
        normalizeEnvToken(databaseTarget.host) ===
          normalizeEnvToken(productionReference.host)) ||
        (productionReference.hostFingerprintReliable &&
          productionReference.hostFingerprint &&
          databaseTarget.hostFingerprint ===
            productionReference.hostFingerprint)),
  );
  const databaseUserMatchesProduction = isForbiddenSharedHostUser(
    databaseTarget,
    productionReference,
  );
  const sharedHostStatus = getSharedHostStatus({
    operation: normalizedOperation,
    signals,
    databaseTarget,
    productionReference,
  });
  const sharedHostAllowed = sharedHostStatus.eligible;

  if (
    productionReference.databaseNameReliable &&
    productionReference.databaseName &&
    databaseTarget.databaseName &&
    normalizeEnvToken(productionReference.databaseName) ===
      normalizeEnvToken(databaseTarget.databaseName)
  ) {
    reasons.push("DATABASE_NAME_MATCHES_PRODUCTION_REFERENCE");
  }

  if (databaseUserMatchesProduction) {
    reasons.push("DATABASE_USER_MATCHES_PRODUCTION");
  }

  if (databaseHostMatchesProduction && !sharedHostAllowed) {
    reasons.push("DATABASE_HOST_MATCHES_PRODUCTION");
    if (!signals.allowSharedDbHostForStaging) {
      reasons.push("ALLOW_SHARED_DB_HOST_FOR_STAGING_FALSE");
    }
    if (!sharedHostStatus.productionHostTrusted) {
      reasons.push("SHARED_HOST_PRODUCTION_REFERENCE_NOT_RELIABLE");
    }
    if (!sharedHostStatus.productionUserTrusted) {
      reasons.push("SHARED_HOST_USER_NOT_VERIFIABLE");
    }
    if (!sharedHostStatus.permissionScopeVerifiable) {
      reasons.push("SHARED_DB_HOST_REQUIRES_VERIFIED_PERMISSION_SCOPE");
    }
  }

  const summary = {
    operation: normalizedOperation,
    runtimeEnvironment: signals.runtimeEnvironment,
    appEnv: signals.appEnv || null,
    databaseEnv: signals.databaseEnv || null,
    nodeEnv: signals.nodeEnv || null,
    vercelEnv: signals.vercelEnv || null,
    databaseHost: maskHost(databaseTarget.host),
    databaseHostFingerprint: databaseTarget.hostFingerprint,
    databaseName: databaseTarget.databaseName ?? null,
    databaseUserFingerprint: databaseTarget.userFingerprint,
    databaseUrlPresent: databaseTarget.rawUrlPresent,
    databaseUrlParseable: databaseTarget.rawUrlParseable,
    databaseHostMatchesProduction,
    databaseUserMatchesProduction,
    hostMatchesProduction: databaseHostMatchesProduction,
    userMatchesProduction: databaseUserMatchesProduction,
    isProductionDatabase:
      PRODUCTION_DATABASE_NAMES.has(databaseNameLower) ||
      reasons.includes("DATABASE_NAME_MATCHES_PRODUCTION_REFERENCE") ||
      reasons.includes("DATABASE_USER_MATCHES_PRODUCTION"),
    allowStagingWrites: signals.allowStagingWrites,
    allowSharedDbHostForStaging: signals.allowSharedDbHostForStaging,
    sharedHostAllowed,
    productionReferenceConfigured: Boolean(productionReference.configured),
    blockingReasons: reasons,
    writeAllowed: reasons.length === 0,
  };

  return summary;
}

function evaluateStagingEnvironment(env = process.env) {
  const signals = getEnvironmentSignals(env);
  const databaseTarget = parseDatabaseTarget(env);
  const productionReference = getProductionReference(env);
  const appUrl = analyzeAppUrl(env);
  const mercadoPagoPublicKey = classifyMercadoPagoCredential(
    env.NEXT_PUBLIC_MERCADOPAGO_PUBLIC_KEY,
  );
  const mercadoPagoAccessToken = classifyMercadoPagoCredential(
    env.MERCADOPAGO_ACCESS_TOKEN,
  );

  const reasons = [];
  const databaseNameLower = normalizeEnvToken(databaseTarget.databaseName);
  const hostMatchesProduction = Boolean(
    databaseTarget.host &&
      ((productionReference.hostReliable &&
        productionReference.host &&
        normalizeEnvToken(databaseTarget.host) ===
          normalizeEnvToken(productionReference.host)) ||
        (productionReference.hostFingerprintReliable &&
          productionReference.hostFingerprint &&
          databaseTarget.hostFingerprint ===
            productionReference.hostFingerprint)),
  );
  const userMatchesProduction = Boolean(
    isForbiddenSharedHostUser(databaseTarget, productionReference),
  );
  const sharedHostStatus = getSharedHostStatus({
    operation: "scripts/seed-staging-qa.js --write",
    signals,
    databaseTarget,
    productionReference,
  });
  const sharedHostAllowed = sharedHostStatus.eligible;

  if (!STAGING_RUNTIME_ENVIRONMENTS.has(signals.appEnv)) {
    reasons.push("APP_ENV_NOT_STAGING_OR_TEST");
  }

  if (!STAGING_RUNTIME_ENVIRONMENTS.has(signals.databaseEnv)) {
    reasons.push("DATABASE_ENV_NOT_STAGING_OR_TEST");
  }

  if (!databaseTarget.rawUrlPresent) {
    reasons.push("DATABASE_URL_MISSING");
  }

  if (!databaseTarget.rawUrlParseable) {
    reasons.push(databaseTarget.parseError || "DATABASE_URL_INVALID");
  }

  if (!databaseTarget.databaseName) {
    reasons.push("DATABASE_NAME_MISSING");
  }

  if (!databaseTarget.host) {
    reasons.push("DATABASE_HOST_MISSING");
  }

  if (PRODUCTION_DATABASE_NAMES.has(databaseNameLower)) {
    reasons.push("DATABASE_NAME_IS_PRODUCTION");
  }

  if (!productionReference.configured) {
    reasons.push("PRODUCTION_HOST_REFERENCE_MISSING");
  }

  if (
    productionReference.hostFingerprint &&
    !productionReference.hostFingerprintReliable
  ) {
    reasons.push("PRODUCTION_HOST_FINGERPRINT_INVALID");
  }

  if (
    productionReference.userFingerprint &&
    !productionReference.userFingerprintReliable
  ) {
    reasons.push("PRODUCTION_USER_FINGERPRINT_INVALID");
  }

  if (hostMatchesProduction && !sharedHostAllowed) {
    reasons.push("DATABASE_HOST_MATCHES_PRODUCTION");
    if (!signals.allowSharedDbHostForStaging) {
      reasons.push("ALLOW_SHARED_DB_HOST_FOR_STAGING_FALSE");
    }
    if (!sharedHostStatus.productionHostTrusted) {
      reasons.push("SHARED_HOST_PRODUCTION_REFERENCE_NOT_RELIABLE");
    }
    if (!sharedHostStatus.productionUserTrusted) {
      reasons.push("SHARED_HOST_USER_NOT_VERIFIABLE");
    }
    if (!sharedHostStatus.permissionScopeVerifiable) {
      reasons.push("SHARED_DB_HOST_REQUIRES_VERIFIED_PERMISSION_SCOPE");
    }
  }

  if (
    productionReference.databaseNameReliable &&
    productionReference.databaseName &&
    databaseTarget.databaseName &&
    normalizeEnvToken(productionReference.databaseName) === databaseNameLower
  ) {
    reasons.push("DATABASE_NAME_MATCHES_PRODUCTION_REFERENCE");
  }

  if (userMatchesProduction) {
    reasons.push("DATABASE_USER_MATCHES_PRODUCTION");
  }

  if (signals.vercelEnv === "production") {
    reasons.push("VERCEL_ENV_PRODUCTION");
  }

  if (signals.nodeEnv === "production") {
    reasons.push("NODE_ENV_PRODUCTION");
  }

  if (appUrl.parseError) {
    reasons.push(appUrl.parseError);
  }

  if (!appUrl.parseError && !appUrl.isHttps) {
    reasons.push("APP_URL_NOT_HTTPS");
  }

  if (appUrl.isLocalhost) {
    reasons.push("APP_URL_LOCALHOST");
  }

  if (appUrl.isPlaceholderHostname) {
    reasons.push("APP_URL_PLACEHOLDER");
  }

  if (appUrl.isProductionHostname) {
    reasons.push("APP_URL_POINTS_TO_PRODUCTION");
  }

  if (!appUrl.isPreviewHostname && signals.vercelEnv === "preview") {
    reasons.push("APP_URL_NOT_PREVIEW_HOST");
  }

  if (mercadoPagoPublicKey.state !== "test") {
    reasons.push("MERCADOPAGO_PUBLIC_KEY_NOT_VERIFIED_AS_TEST");
  }

  if (mercadoPagoAccessToken.state !== "test") {
    reasons.push("MERCADOPAGO_ACCESS_TOKEN_NOT_VERIFIED_AS_TEST");
  }

  const writesAllowed = evaluateWriteTarget({
    operation: "scripts/seed-staging-qa.js --write",
    env,
  }).writeAllowed;

  return {
    appEnv: signals.appEnv || null,
    databaseEnv: signals.databaseEnv || null,
    nodeEnv: signals.nodeEnv || null,
    vercelEnv: signals.vercelEnv || null,
    runtimeEnvironment: signals.runtimeEnvironment,
    databaseName: databaseTarget.databaseName ?? null,
    databaseHost: maskHost(databaseTarget.host),
    databaseHostFingerprint: databaseTarget.hostFingerprint,
    databaseUserFingerprint: databaseTarget.userFingerprint,
    databaseUrlPresent: databaseTarget.rawUrlPresent,
    databaseUrlParseable: databaseTarget.rawUrlParseable,
    allowStagingWrites: signals.allowStagingWrites,
    allowSharedDbHostForStaging: signals.allowSharedDbHostForStaging,
    productionReferenceConfigured: Boolean(productionReference.configured),
    hostMatchesProduction,
    userMatchesProduction,
    sharedHostAllowed,
    appUrlHost: appUrl.maskedHost,
    appUrlFingerprint: appUrl.fingerprint,
    appUrlLooksPreview: appUrl.isPreviewHostname,
    mercadoPagoPublicKeyState: mercadoPagoPublicKey.state,
    mercadoPagoPublicKeyFingerprint: mercadoPagoPublicKey.fingerprint,
    mercadoPagoAccessTokenState: mercadoPagoAccessToken.state,
    mercadoPagoAccessTokenFingerprint: mercadoPagoAccessToken.fingerprint,
    writeGuardEligible: writesAllowed,
    blockingReasons: reasons,
    verified: reasons.length === 0,
  };
}

module.exports = {
  ALLOWED_WRITE_OPERATIONS,
  PRODUCTION_APP_HOSTNAMES,
  PRODUCTION_DATABASE_NAMES,
  STAGING_RUNTIME_ENVIRONMENTS,
  analyzeAppUrl,
  classifyMercadoPagoCredential,
  createFingerprint,
  redactReferenceEdge,
  evaluateStagingEnvironment,
  evaluateWriteTarget,
  getEnvironmentSignals,
  getProductionReference,
  getRuntimeEnvironment,
  isAllowedWriteOperation,
  maskHost,
  parseDatabaseTarget,
};
