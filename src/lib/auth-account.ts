import { createHash, randomBytes } from "node:crypto";

import { prisma } from "@/lib/prisma";
import { getResendClient } from "@/lib/resend";

export function normalizeEmail(email: string) {
  return String(email ?? "").trim().toLowerCase();
}

export function normalizePhone(phone: string) {
  return String(phone ?? "")
    .replace(/[^\d]/g, "")
    .slice(0, 15);
}

export function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizeEmail(email));
}

export function isValidPhone(phone: string) {
  const normalized = normalizePhone(phone);
  return normalized.length >= 10;
}

export function validatePasswordStrength(password: string) {
  if (password.length < 8) {
    return "La contraseña debe tener al menos 8 caracteres.";
  }

  if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) {
    return "La contraseña debe incluir al menos una letra y un número.";
  }

  return "";
}

export function generateResetToken() {
  return randomBytes(32).toString("hex");
}

export function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function generateTokenExpiration(minutes = 30) {
  return new Date(Date.now() + minutes * 60 * 1000);
}

export function isCooldownActive(date: Date | string | null | undefined, ms: number) {
  if (!date) return false;
  const sentAt = new Date(date).getTime();
  if (!Number.isFinite(sentAt)) return false;
  return Date.now() - sentAt < ms;
}

export async function ensureUserAuthSecurityColumns() {
  await prisma.$executeRawUnsafe(
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS verification_sent_at DATETIME NULL",
  );
  await prisma.$executeRawUnsafe(
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS reset_password_token VARCHAR(255) NULL",
  );
  await prisma.$executeRawUnsafe(
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS reset_password_expires_at DATETIME NULL",
  );
  await prisma.$executeRawUnsafe(
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS reset_password_sent_at DATETIME NULL",
  );
  await prisma.$executeRawUnsafe(
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS login_attempts INT NOT NULL DEFAULT 0",
  );
  await prisma.$executeRawUnsafe(
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS locked_until DATETIME NULL",
  );
}

export async function sendPasswordResetEmail(email: string, resetToken: string) {
  const baseUrl =
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.APP_URL ||
    "http://localhost:3000";
  const resetUrl = `${baseUrl.replace(/\/$/, "")}/reset-password?token=${encodeURIComponent(resetToken)}&email=${encodeURIComponent(email)}`;

  await getResendClient().emails.send({
    from: "Gogi Eats <onboarding@resend.dev>",
    to: email,
    subject: "Recupera tu contraseña - Gogi Eats",
    html: `
      <h2>Recupera tu contraseña en Gogi Eats</h2>
      <p>Haz clic en el siguiente enlace para crear una nueva contraseña:</p>
      <p><a href="${resetUrl}">${resetUrl}</a></p>
      <p>Este enlace vence en 30 minutos.</p>
    `,
  });
}
