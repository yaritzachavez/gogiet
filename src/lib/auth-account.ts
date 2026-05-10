import { createHash, randomBytes } from "node:crypto";
import type { RowDataPacket } from "mysql2/promise";

import pool from "@/lib/db";
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

type ColumnDefinition = {
  name: string;
  sql: string;
};

const AUTH_USER_COLUMNS: ColumnDefinition[] = [
  { name: "phone", sql: "ADD COLUMN phone VARCHAR(20) NULL" },
  {
    name: "email_verified",
    sql: "ADD COLUMN email_verified BOOLEAN NULL DEFAULT FALSE",
  },
  {
    name: "verification_code",
    sql: "ADD COLUMN verification_code VARCHAR(12) NULL",
  },
  {
    name: "verification_expires_at",
    sql: "ADD COLUMN verification_expires_at DATETIME NULL",
  },
  {
    name: "verification_sent_at",
    sql: "ADD COLUMN verification_sent_at DATETIME NULL",
  },
  {
    name: "reset_password_token",
    sql: "ADD COLUMN reset_password_token VARCHAR(255) NULL",
  },
  {
    name: "reset_password_expires_at",
    sql: "ADD COLUMN reset_password_expires_at DATETIME NULL",
  },
  {
    name: "reset_password_sent_at",
    sql: "ADD COLUMN reset_password_sent_at DATETIME NULL",
  },
  {
    name: "login_attempts",
    sql: "ADD COLUMN login_attempts INT NOT NULL DEFAULT 0",
  },
  {
    name: "locked_until",
    sql: "ADD COLUMN locked_until DATETIME NULL",
  },
  {
    name: "last_login",
    sql: "ADD COLUMN last_login DATETIME NULL",
  },
];

export async function ensureUserAuthSecurityColumns() {
  const [rows] = await pool.query<RowDataPacket[]>(
    `
      SELECT COLUMN_NAME
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'users'
    `,
  );

  const existingColumns = new Set(
    rows
      .map((row) => String(row.COLUMN_NAME ?? "").trim())
      .filter(Boolean),
  );

  for (const column of AUTH_USER_COLUMNS) {
    if (existingColumns.has(column.name)) {
      continue;
    }

    try {
      await pool.query(`ALTER TABLE users ${column.sql}`);
      existingColumns.add(column.name);
      console.log(`[auth-account] columna agregada en users: ${column.name}`);
    } catch (error) {
      const message =
        error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();

      if (message.includes("duplicate column name")) {
        existingColumns.add(column.name);
        continue;
      }

      console.error("[auth-account] error agregando columna users", {
        column: column.name,
        sql: column.sql,
        error,
      });
      throw error;
    }
  }
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
