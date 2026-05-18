import { Resend } from "resend";
import { areInternalToolsEnabled } from "@/lib/internal-tools";
import { logger } from "@/lib/logger";

export function getEmailFromAddress() {
  return process.env.EMAIL_FROM || "Gogi Eats <onboarding@resend.dev>";
}

export function hasResendApiKey() {
  return Boolean(process.env.RESEND_API_KEY);
}

export function getEmailDiagnostics() {
  return {
    emailVerificationEnabled:
      process.env.EMAIL_VERIFICATION_ENABLED !== "false",
    hasResendApiKey: Boolean(process.env.RESEND_API_KEY),
    hasSmtpHost: Boolean(process.env.SMTP_HOST),
    hasSmtpUser: Boolean(process.env.SMTP_USER),
    hasSmtpPass: Boolean(process.env.SMTP_PASS),
    hasEmailFrom: Boolean(process.env.EMAIL_FROM),
    environment: process.env.NODE_ENV ?? "development",
  };
}

export function logEmailDiagnostics(context: string) {
  if (!areInternalToolsEnabled()) {
    return;
  }

  logger.debug("email.diagnostics", "Diagnóstico de configuración de correo", {
    context,
    ...getEmailDiagnostics(),
  });
}

export function shouldUseDevelopmentEmailFallback() {
  return (
    process.env.EMAIL_VERIFICATION_ENABLED === "false" ||
    process.env.NODE_ENV !== "production"
  );
}

export function getResendClient() {
  const apiKey = process.env.RESEND_API_KEY;

  if (!apiKey) {
    throw new Error("Falta configurar RESEND_API_KEY");
  }

  return new Resend(apiKey);
}
