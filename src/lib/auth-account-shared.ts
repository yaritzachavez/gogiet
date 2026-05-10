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

export function generateTokenExpiration(minutes = 30) {
  return new Date(Date.now() + minutes * 60 * 1000);
}

export function isCooldownActive(
  date: Date | string | null | undefined,
  ms: number,
) {
  if (!date) return false;
  const sentAt = new Date(date).getTime();
  if (!Number.isFinite(sentAt)) return false;
  return Date.now() - sentAt < ms;
}
