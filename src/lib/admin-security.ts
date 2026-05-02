import jwt from "jsonwebtoken";
import type { ResultSetHeader, RowDataPacket } from "mysql2/promise";
import type { NextRequest } from "next/server";

import pool from "@/lib/db";

export type JwtPayload = {
  id: number;
};

export type SessionRow = RowDataPacket & {
  id: number;
  device_name: string | null;
  location: string | null;
  last_active_at: Date | string | null;
  status: string | null;
};

export function getAuthUser(req: NextRequest) {
  const auth = req.headers.get("authorization");
  const token = auth?.startsWith("Bearer ")
    ? auth.split(" ")[1]
    : req.cookies.get("authToken")?.value;
  const secret = process.env.JWT_SECRET || "gogi-dev-secret";

  if (!token) {
    return { token: null, user: null };
  }

  try {
    return {
      token,
      user: jwt.verify(token, secret) as JwtPayload,
    };
  } catch {
    return { token, user: null };
  }
}

export async function isAdminGeneral(userId: number) {
  const [rows] = await pool.query<RowDataPacket[]>(
    `
      SELECT 1
      FROM user_roles ur
      INNER JOIN roles r ON r.id = ur.role_id
      WHERE ur.user_id = ? AND r.name = 'admin_general'
      LIMIT 1
    `,
    [userId],
  );

  return rows.length > 0;
}

export async function ensureAdminSettingsTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS admin_settings (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL UNIQUE,
      language VARCHAR(20) NOT NULL DEFAULT 'es-MX',
      timezone VARCHAR(64) NOT NULL DEFAULT 'America/Mexico_City',
      realtime_notifications BOOLEAN NOT NULL DEFAULT TRUE,
      dark_mode BOOLEAN NOT NULL DEFAULT FALSE,
      two_factor_enabled BOOLEAN NOT NULL DEFAULT FALSE,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      CONSTRAINT fk_admin_settings_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  const [columns] = await pool.query<RowDataPacket[]>(
    `
      SELECT COLUMN_NAME
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'admin_settings'
    `,
  );

  const hasTwoFactor = columns.some(
    (column) => column.COLUMN_NAME === "two_factor_enabled",
  );

  if (!hasTwoFactor) {
    await pool.query(`
      ALTER TABLE admin_settings
      ADD COLUMN two_factor_enabled BOOLEAN NOT NULL DEFAULT FALSE
    `);
  }
}

export async function ensureUserSessionsTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS user_sessions (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL,
      token VARCHAR(512) NOT NULL,
      device_name VARCHAR(120) NULL,
      location VARCHAR(120) NULL,
      last_active_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      status VARCHAR(30) NOT NULL DEFAULT 'active',
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_user_sessions_user_id (user_id),
      INDEX idx_user_sessions_status (status),
      CONSTRAINT fk_user_sessions_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);
}

export function getDeviceName(userAgent: string | null) {
  if (!userAgent) {
    return "Dispositivo desconocido";
  }

  const normalizedAgent = userAgent.toLowerCase();

  if (normalizedAgent.includes("iphone")) return "iPhone";
  if (normalizedAgent.includes("ipad")) return "iPad";
  if (normalizedAgent.includes("android")) return "Android";
  if (normalizedAgent.includes("mac os")) return "Mac";
  if (normalizedAgent.includes("windows")) return "Windows PC";
  if (normalizedAgent.includes("linux")) return "Linux";

  return "Navegador web";
}

export function getLocationLabel(ip: string | null) {
  if (!ip) {
    return "Ubicación no disponible";
  }

  return `IP ${ip}`;
}

export async function createUserSession(params: {
  userId: number;
  token: string;
  deviceName: string;
  location: string;
}) {
  await ensureUserSessionsTable();

  await pool.query<ResultSetHeader>(
    `
      INSERT INTO user_sessions (
        user_id,
        token,
        device_name,
        location,
        last_active_at,
        status
      )
      VALUES (?, ?, ?, ?, NOW(), 'active')
    `,
    [params.userId, params.token, params.deviceName, params.location],
  );
}
