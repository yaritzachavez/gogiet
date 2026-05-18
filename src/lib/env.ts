const MIN_SECRET_LENGTH = 32;

const FORBIDDEN_SECRET_VALUES = new Set([
  "gogi-dev-secret",
  "dev-secret",
  "jwt-secret",
  "secret",
  "changeme",
  "change-me",
  "replace-me",
  "placeholder",
  "test-secret",
  "default-secret",
]);

function failMissingEnv(name: string): never {
  throw new Error(`❌ Missing required environment variable: ${name}`);
}

function failWeakEnv(name: string, reason: string): never {
  throw new Error(`❌ Invalid environment variable ${name}: ${reason}`);
}

export type RuntimeEnvironment = "development" | "preview" | "production";

export function getRuntimeEnvironment(): RuntimeEnvironment {
  const nodeEnv = String(process.env.NODE_ENV ?? "")
    .trim()
    .toLowerCase();
  const vercelEnv = String(process.env.VERCEL_ENV ?? "")
    .trim()
    .toLowerCase();

  if (nodeEnv !== "production") {
    return "development";
  }

  if (vercelEnv === "preview") {
    return "preview";
  }

  return "production";
}

function normalizeEnvValue(name: string, value: string | undefined | null) {
  const normalized = String(value ?? "").trim();

  if (!normalized) {
    failMissingEnv(name);
  }

  return normalized;
}

function validateSecretStrength(name: string, value: string) {
  if (value.length < MIN_SECRET_LENGTH) {
    failWeakEnv(name, `must be at least ${MIN_SECRET_LENGTH} characters long`);
  }

  if (FORBIDDEN_SECRET_VALUES.has(value.toLowerCase())) {
    failWeakEnv(name, "uses a forbidden placeholder or development secret");
  }

  if (/^(your|insert|replace|example|sample)[-_ ]?/i.test(value)) {
    failWeakEnv(name, "looks like a placeholder");
  }
}

export function getRequiredSecret(name: string) {
  const value = normalizeEnvValue(name, process.env[name]);
  validateSecretStrength(name, value);
  return value;
}

export function validateOptionalSecret(name: string) {
  const rawValue = process.env[name];

  if (rawValue == null || String(rawValue).trim() === "") {
    return null;
  }

  const value = String(rawValue).trim();
  validateSecretStrength(name, value);
  return value;
}

let runtimeEnvValidated = false;

export function validateRuntimeEnv() {
  if (runtimeEnvValidated) {
    return;
  }

  const runtimeEnvironment = getRuntimeEnvironment();

  getRequiredSecret("JWT_SECRET");
  validateOptionalSecret("NEXTAUTH_SECRET");
  validateOptionalSecret("SESSION_SECRET");
  validateOptionalSecret("ADMIN_SECRET");

  if (runtimeEnvironment === "production") {
    getRequiredSecret("MERCADOPAGO_WEBHOOK_SECRET");
  }

  runtimeEnvValidated = true;
}

export const JWT_SECRET = (() => {
  return getRequiredSecret("JWT_SECRET");
})();

export function getMercadoPagoWebhookSecret() {
  if (getRuntimeEnvironment() === "production") {
    return getRequiredSecret("MERCADOPAGO_WEBHOOK_SECRET");
  }

  return validateOptionalSecret("MERCADOPAGO_WEBHOOK_SECRET");
}
