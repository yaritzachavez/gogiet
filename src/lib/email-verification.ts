import { getResendClient } from "@/lib/resend";

export function generateVerificationCode() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

export function generateVerificationExpiration() {
  return new Date(Date.now() + 10 * 60 * 1000);
}

export async function sendVerificationCodeEmail(
  email: string,
  verificationCode: string,
) {
  await getResendClient().emails.send({
    from: "Gogi Eats <onboarding@resend.dev>",
    to: email,
    subject: "Codigo de verificacion - Gogi Eats",
    html: `
      <h2>Verifica tu cuenta en Gogi Eats</h2>
      <p>Tu codigo de verificacion es:</p>
      <h1>${verificationCode}</h1>
      <p>Este codigo vence en 10 minutos.</p>
    `,
  });
}

export function isUserTemporarilyVerified(user: {
  email_verified?: boolean | null;
  verification_code?: string | null;
  verification_expires_at?: Date | string | null;
}) {
  if (user.email_verified === true) {
    return true;
  }

  if (
    user.email_verified === false &&
    user.verification_code &&
    user.verification_expires_at
  ) {
    return false;
  }

  return true;
}
