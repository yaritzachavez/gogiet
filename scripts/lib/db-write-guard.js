function getRuntimeEnvironment(env = process.env) {
  const nodeEnv = String(env.NODE_ENV ?? "")
    .trim()
    .toLowerCase();
  const vercelEnv = String(env.VERCEL_ENV ?? "")
    .trim()
    .toLowerCase();
  const appEnv = String(env.APP_ENV ?? env.DATABASE_ENV ?? "")
    .trim()
    .toLowerCase();

  if (vercelEnv === "preview" || appEnv === "preview") {
    return "preview";
  }

  if (nodeEnv === "production" || vercelEnv === "production") {
    return "production";
  }

  return "development";
}

function parseDatabaseTarget(env = process.env) {
  const rawUrl = String(env.DATABASE_URL ?? "").trim();
  let host = String(env.DB_HOST ?? "").trim() || null;
  let databaseName = String(env.DB_NAME ?? "").trim() || null;

  if (rawUrl) {
    try {
      const parsed = new URL(rawUrl);
      host = parsed.hostname || host;
      databaseName = parsed.pathname.replace(/^\//, "") || databaseName;
    } catch {
      // ignore invalid URL here; consumers still get the fallback summary
    }
  }

  return {
    runtimeEnvironment: getRuntimeEnvironment(env),
    host,
    databaseName,
    databaseUrlPresent: Boolean(rawUrl),
    allowStagingWrites:
      String(env.ALLOW_STAGING_DB_WRITES ?? "")
        .trim()
        .toLowerCase() === "true",
  };
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

function isProductionDatabase(target) {
  const databaseName = String(target.databaseName ?? "")
    .trim()
    .toLowerCase();
  const runtimeEnvironment = String(target.runtimeEnvironment ?? "")
    .trim()
    .toLowerCase();

  return (
    databaseName === "gogi_prod" ||
    databaseName === "production" ||
    runtimeEnvironment === "production"
  );
}

function buildSanitizedDbOperationSummary({
  operation,
  mode,
  env = process.env,
}) {
  const target = parseDatabaseTarget(env);
  return {
    operation,
    mode,
    runtimeEnvironment: target.runtimeEnvironment,
    databaseHost: maskHost(target.host),
    databaseName: target.databaseName ?? null,
    databaseUrlPresent: target.databaseUrlPresent,
    isProductionDatabase: isProductionDatabase(target),
    allowStagingWrites: target.allowStagingWrites,
  };
}

function logDbOperationTarget(options) {
  const summary = buildSanitizedDbOperationSummary(options);
  console.info("[db-guard]", JSON.stringify(summary));
  return summary;
}

function assertSafeWriteTarget({
  operation,
  env = process.env,
  requireExplicitFlag = true,
}) {
  const summary = logDbOperationTarget({
    operation,
    mode: "write",
    env,
  });

  if (summary.isProductionDatabase) {
    throw new Error(
      `Write blocked: ${summary.databaseName ?? "unknown"} is a production database target.`,
    );
  }

  if (requireExplicitFlag && !summary.allowStagingWrites) {
    throw new Error(
      "Write blocked: set ALLOW_STAGING_DB_WRITES=true only in isolated non-production environments.",
    );
  }

  return summary;
}

module.exports = {
  assertSafeWriteTarget,
  buildSanitizedDbOperationSummary,
  getRuntimeEnvironment,
  logDbOperationTarget,
  parseDatabaseTarget,
};
