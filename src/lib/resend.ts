import { Resend } from "resend";
import { areInternalToolsEnabled } from "@/lib/internal-tools";

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

  const diagnostics = getEmailDiagnostics();

  console.log(
    `${context} EMAIL_VERIFICATION_ENABLED:`,
    diagnostics.emailVerificationEnabled,
  );
  console.log(`${context} SMTP_HOST existe:`, diagnostics.hasSmtpHost);
  console.log(`${context} SMTP_USER existe:`, diagnostics.hasSmtpUser);
  console.log(`${context} SMTP_PASS existe:`, diagnostics.hasSmtpPass);
  console.log(`${context} EMAIL_FROM existe:`, diagnostics.hasEmailFrom);
  console.log(`${context} RESEND_API_KEY existe:`, diagnostics.hasResendApiKey);
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
