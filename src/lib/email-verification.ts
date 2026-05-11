import { getEmailFromAddress, getResendClient } from "@/lib/resend";

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
  const response = await getResendClient().emails.send({
    from: getEmailFromAddress(),
    to: email,
    subject: "Codigo de verificacion - Gogi Eats",
    html: `
      <h2>Verifica tu cuenta en Gogi Eats</h2>
      <p>Tu codigo de verificacion es:</p>
      <h1>${verificationCode}</h1>
      <p>Este codigo vence en 10 minutos.</p>
    `,
  });

  if (response.error) {
    throw new Error(response.error.message || "No se pudo enviar el correo de verificacion");
  }
}

export function isUserTemporarilyVerified(user: {
  verification_code?: string | null;
  verification_expires_at?: Date | string | null;
}) {
  if (
    user.verification_code &&
    user.verification_expires_at
  ) {
    return new Date(user.verification_expires_at).getTime() < Date.now();
  }

  return true;
}
