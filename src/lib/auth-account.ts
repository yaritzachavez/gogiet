import { createHash, randomBytes } from "node:crypto";

import { getResendClient } from "@/lib/resend";
export {
  generateTokenExpiration,
  isCooldownActive,
  isValidEmail,
  isValidPhone,
  normalizeEmail,
  normalizePhone,
  validatePasswordStrength,
} from "@/lib/auth-account-shared";

export function generateResetToken() {
  return randomBytes(32).toString("hex");
}

export function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export async function sendPasswordResetEmail(email: string, resetToken: string) {
  const baseUrl =
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.APP_URL ||
    "https://www.gogieats.shop";
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
