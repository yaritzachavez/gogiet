import pool from "@/lib/db";

let cachedUserColumns: Set<string> | null = null;

async function loadUserColumns() {
  const [rows] = await pool.query("SHOW COLUMNS FROM users");
  const columns = new Set(
    (rows as Array<{ Field?: string }>).map((row) => String(row.Field ?? "")),
  );

  cachedUserColumns = columns;
  return columns;
}

export async function getUserColumns() {
  if (cachedUserColumns) {
    return cachedUserColumns;
  }

  try {
    return await loadUserColumns();
  } catch (error) {
    console.warn("No se pudieron cargar las columnas de users para auth compat:", error);
    return new Set<string>();
  }
}

export async function hasUserColumn(columnName: string) {
  const columns = await getUserColumns();
  return columns.has(columnName);
}

export async function getAuthCompatibilityFlags() {
  const columns = await getUserColumns();

  return {
    hasEmailVerification:
      columns.has("verification_code") &&
      columns.has("verification_expires_at"),
    hasVerificationCooldown: columns.has("verification_sent_at"),
    hasPasswordReset:
      columns.has("reset_password_token") &&
      columns.has("reset_password_expires_at"),
    hasPasswordResetCooldown: columns.has("reset_password_sent_at"),
    hasLoginAttempts: columns.has("login_attempts"),
    hasLockedUntil: columns.has("locked_until"),
    hasLastLogin: columns.has("last_login"),
  };
}
