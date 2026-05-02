import type {
  Pool,
  PoolConnection,
  ResultSetHeader,
  RowDataPacket,
} from "mysql2/promise";

import pool from "@/lib/db";

type Queryable = Pool | PoolConnection;

type NotificationRow = RowDataPacket & {
  id: number;
  user_id: number;
  type: string;
  title: string;
  message: string;
  related_id: number | null;
  is_read: number | boolean | null;
  created_at: string;
};

export async function ensureNotificationsTable(executor: Queryable = pool) {
  await executor.query(
    `
      CREATE TABLE IF NOT EXISTS notifications (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        type VARCHAR(50) NOT NULL,
        title VARCHAR(160) NOT NULL,
        message TEXT NOT NULL,
        related_id INT NULL,
        is_read BOOLEAN NOT NULL DEFAULT FALSE,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_notifications_user_id (user_id),
        INDEX idx_notifications_is_read (is_read),
        INDEX idx_notifications_created_at (created_at)
      )
    `,
  );
}

export async function getAdminGeneralUserIds(executor: Queryable = pool) {
  await ensureNotificationsTable(executor);

  const [rows] = await executor.query<RowDataPacket[]>(
    `
      SELECT DISTINCT ur.user_id
      FROM user_roles ur
      INNER JOIN roles r ON r.id = ur.role_id
      WHERE r.name = 'admin_general'
    `,
  );

  return rows.map((row) => Number(row.user_id)).filter((id) => id > 0);
}

export async function createNotification(
  {
    userId,
    type,
    title,
    message,
    relatedId = null,
  }: {
    userId: number;
    type: string;
    title: string;
    message: string;
    relatedId?: number | null;
  },
  executor: Queryable = pool,
) {
  await ensureNotificationsTable(executor);

  const [result] = await executor.query<ResultSetHeader>(
    `
      INSERT INTO notifications (
        user_id,
        type,
        title,
        message,
        related_id,
        is_read,
        created_at
      )
      VALUES (?, ?, ?, ?, ?, 0, NOW())
    `,
    [userId, type, title, message, relatedId],
  );

  return result.insertId;
}

export async function createNotificationsForUsers(
  userIds: number[],
  {
    type,
    title,
    message,
    relatedId = null,
  }: {
    type: string;
    title: string;
    message: string;
    relatedId?: number | null;
  },
  executor: Queryable = pool,
) {
  const uniqueUserIds = Array.from(new Set(userIds)).filter((id) => id > 0);

  if (!uniqueUserIds.length) {
    return;
  }

  await ensureNotificationsTable(executor);

  for (const userId of uniqueUserIds) {
    await createNotification(
      { userId, type, title, message, relatedId },
      executor,
    );
  }
}

export async function createNotificationsForAdminGeneral(
  payload: {
    type: string;
    title: string;
    message: string;
    relatedId?: number | null;
  },
  executor: Queryable = pool,
) {
  const adminIds = await getAdminGeneralUserIds(executor);
  await createNotificationsForUsers(adminIds, payload, executor);
}

export async function getNotificationsForUser(
  userId: number,
  executor: Queryable = pool,
) {
  await ensureNotificationsTable(executor);

  const [rows] = await executor.query<NotificationRow[]>(
    `
      SELECT
        id,
        user_id,
        type,
        title,
        message,
        related_id,
        is_read,
        created_at
      FROM notifications
      WHERE user_id = ?
      ORDER BY created_at DESC, id DESC
    `,
    [userId],
  );

  return rows.map((row) => ({
    id: Number(row.id),
    user_id: Number(row.user_id),
    type: String(row.type),
    title: String(row.title),
    message: String(row.message),
    related_id:
      row.related_id === null || row.related_id === undefined
        ? null
        : Number(row.related_id),
    is_read: Boolean(row.is_read),
    created_at: String(row.created_at),
  }));
}
