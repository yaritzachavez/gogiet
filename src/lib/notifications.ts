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
  user_id: number | null;
  business_id: number | null;
  role: string | null;
  type: string;
  title: string;
  message: string;
  related_id: number | null;
  is_read: number | boolean | null;
  data_json: string | null;
  created_at: string;
  updated_at: string;
};

type NotificationColumnRow = RowDataPacket & {
  COLUMN_NAME: string;
  IS_NULLABLE: string;
};

type NotificationPayload = {
  userId?: number | null;
  businessId?: number | null;
  role?: string | null;
  type: string;
  title: string;
  message: string;
  relatedId?: number | null;
  dataJson?: Record<string, unknown> | Array<unknown> | string | null;
};

export type NotificationActor = {
  userId: number;
  businessIds?: number[];
  roles?: string[];
};

function normalizeId(value: unknown) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function normalizeRole(value: unknown) {
  const role = String(value ?? "").trim();
  return role.length > 0 ? role : null;
}

function normalizeNotificationData(
  value: Record<string, unknown> | Array<unknown> | string | null | undefined,
) {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  return JSON.stringify(value);
}

function parseNotificationData(value: string | null) {
  if (!value) return null;

  try {
    return JSON.parse(value) as unknown;
  } catch {
    return value;
  }
}

async function getNotificationColumns(executor: Queryable = pool) {
  const [rows] = await executor.query<NotificationColumnRow[]>(
    `
      SELECT COLUMN_NAME, IS_NULLABLE
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'notifications'
    `,
  );

  return rows;
}

async function addNotificationColumnIfMissing(
  columnName: string,
  definition: string,
  executor: Queryable = pool,
) {
  const columns = await getNotificationColumns(executor);
  const hasColumn = columns.some((column) => column.COLUMN_NAME === columnName);

  if (hasColumn) {
    return;
  }

  await executor.query(
    `ALTER TABLE notifications ADD COLUMN \`${columnName}\` ${definition}`,
  );
}

async function addNotificationIndexIfMissing(
  indexName: string,
  definitionSql: string,
  executor: Queryable = pool,
) {
  const [rows] = await executor.query<RowDataPacket[]>(
    `
      SELECT INDEX_NAME
      FROM INFORMATION_SCHEMA.STATISTICS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'notifications'
        AND INDEX_NAME = ?
      LIMIT 1
    `,
    [indexName],
  );

  if (rows.length > 0) {
    return;
  }

  await executor.query(
    `ALTER TABLE notifications ADD INDEX ${indexName} ${definitionSql}`,
  );
}

export async function ensureNotificationsTable(executor: Queryable = pool) {
  await executor.query(
    `
      CREATE TABLE IF NOT EXISTS notifications (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NULL,
        business_id INT NULL,
        \`role\` VARCHAR(80) NULL,
        type VARCHAR(50) NOT NULL,
        title VARCHAR(160) NOT NULL,
        message TEXT NOT NULL,
        related_id INT NULL,
        is_read BOOLEAN NOT NULL DEFAULT FALSE,
        data_json JSON NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_notifications_user_id (user_id),
        INDEX idx_notifications_business_id (business_id),
        INDEX idx_notifications_role (\`role\`),
        INDEX idx_notifications_is_read (is_read),
        INDEX idx_notifications_created_at (created_at)
      )
    `,
  );

  await addNotificationColumnIfMissing("business_id", "INT NULL", executor);
  await addNotificationColumnIfMissing("role", "VARCHAR(80) NULL", executor);
  await addNotificationColumnIfMissing("related_id", "INT NULL", executor);
  await addNotificationColumnIfMissing(
    "is_read",
    "BOOLEAN NOT NULL DEFAULT FALSE",
    executor,
  );
  await addNotificationColumnIfMissing("data_json", "JSON NULL", executor);
  await addNotificationColumnIfMissing(
    "updated_at",
    "DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP",
    executor,
  );

  const columns = await getNotificationColumns(executor);
  const userIdColumn = columns.find(
    (column) => column.COLUMN_NAME === "user_id",
  );

  if (userIdColumn?.IS_NULLABLE === "NO") {
    await executor.query(
      `
        ALTER TABLE notifications
        MODIFY COLUMN user_id INT NULL
      `,
    );
  }

  await addNotificationIndexIfMissing(
    "idx_notifications_business_id",
    "(business_id)",
    executor,
  );
  await addNotificationIndexIfMissing(
    "idx_notifications_role",
    "(`role`)",
    executor,
  );
  await addNotificationIndexIfMissing(
    "idx_notifications_is_read",
    "(is_read)",
    executor,
  );
  await addNotificationIndexIfMissing(
    "idx_notifications_created_at",
    "(created_at)",
    executor,
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
    userId = null,
    businessId = null,
    role = null,
    type,
    title,
    message,
    relatedId = null,
    dataJson = null,
  }: NotificationPayload,
  executor: Queryable = pool,
) {
  await ensureNotificationsTable(executor);

  const normalizedUserId = normalizeId(userId);
  const normalizedBusinessId = normalizeId(businessId);
  const normalizedRole = normalizeRole(role);

  if (!normalizedUserId && !normalizedBusinessId && !normalizedRole) {
    throw new Error(
      "La notificación requiere userId, businessId o role para guardarse.",
    );
  }

  const [result] = await executor.query<ResultSetHeader>(
    `
      INSERT INTO notifications (
        user_id,
        business_id,
        \`role\`,
        type,
        title,
        message,
        related_id,
        is_read,
        data_json,
        created_at,
        updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, NOW(), NOW())
    `,
    [
      normalizedUserId,
      normalizedBusinessId,
      normalizedRole,
      type,
      title,
      message,
      normalizeId(relatedId),
      normalizeNotificationData(dataJson),
    ],
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
    dataJson = null,
  }: Omit<NotificationPayload, "userId" | "businessId" | "role">,
  executor: Queryable = pool,
) {
  const uniqueUserIds = Array.from(new Set(userIds))
    .map((userId) => normalizeId(userId))
    .filter((userId): userId is number => Boolean(userId));

  if (!uniqueUserIds.length) {
    return;
  }

  await ensureNotificationsTable(executor);

  for (const userId of uniqueUserIds) {
    await createNotification(
      { userId, type, title, message, relatedId, dataJson },
      executor,
    );
  }
}

export async function createNotificationForBusiness(
  businessId: number,
  {
    type,
    title,
    message,
    relatedId = null,
    dataJson = null,
  }: Omit<NotificationPayload, "userId" | "businessId" | "role">,
  executor: Queryable = pool,
) {
  const normalizedBusinessId = normalizeId(businessId);

  if (!normalizedBusinessId) {
    return;
  }

  await createNotification(
    {
      businessId: normalizedBusinessId,
      type,
      title,
      message,
      relatedId,
      dataJson,
    },
    executor,
  );
}

export async function createNotificationForRole(
  role: string,
  {
    type,
    title,
    message,
    relatedId = null,
    dataJson = null,
  }: Omit<NotificationPayload, "userId" | "businessId" | "role">,
  executor: Queryable = pool,
) {
  const normalizedRole = normalizeRole(role);

  if (!normalizedRole) {
    return;
  }

  await createNotification(
    {
      role: normalizedRole,
      type,
      title,
      message,
      relatedId,
      dataJson,
    },
    executor,
  );
}

export async function createNotificationsForAdminGeneral(
  payload: Omit<NotificationPayload, "userId" | "businessId" | "role">,
  executor: Queryable = pool,
) {
  const adminIds = await getAdminGeneralUserIds(executor);
  await createNotificationsForUsers(adminIds, payload, executor);
}

function serializeNotificationError(error: unknown) {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
    };
  }

  return {
    message: String(error),
  };
}

export async function createNotificationSafely(
  payload: NotificationPayload,
  executor: Queryable = pool,
) {
  try {
    await createNotification(payload, executor);
    return true;
  } catch (error) {
    console.error("[notifications] no se pudo guardar la notificación:", {
      payload: {
        userId: normalizeId(payload.userId),
        businessId: normalizeId(payload.businessId),
        role: normalizeRole(payload.role),
        type: payload.type,
        title: payload.title,
        relatedId: normalizeId(payload.relatedId),
      },
      error: serializeNotificationError(error),
    });
    return false;
  }
}

export async function createNotificationsForUsersSafely(
  userIds: number[],
  payload: Omit<NotificationPayload, "userId" | "businessId" | "role">,
  executor: Queryable = pool,
) {
  try {
    await createNotificationsForUsers(userIds, payload, executor);
    return true;
  } catch (error) {
    console.error(
      "[notifications] no se pudieron guardar notificaciones para usuarios:",
      {
        userIds: Array.from(new Set(userIds.map((userId) => normalizeId(userId)).filter(Boolean))),
        type: payload.type,
        title: payload.title,
        relatedId: normalizeId(payload.relatedId),
        error: serializeNotificationError(error),
      },
    );
    return false;
  }
}

export async function createNotificationForBusinessSafely(
  businessId: number,
  payload: Omit<NotificationPayload, "userId" | "businessId" | "role">,
  executor: Queryable = pool,
) {
  try {
    await createNotificationForBusiness(businessId, payload, executor);
    return true;
  } catch (error) {
    console.error(
      "[notifications] no se pudo guardar notificación para negocio:",
      {
        businessId: normalizeId(businessId),
        type: payload.type,
        title: payload.title,
        relatedId: normalizeId(payload.relatedId),
        error: serializeNotificationError(error),
      },
    );
    return false;
  }
}

export async function createNotificationsForAdminGeneralSafely(
  payload: Omit<NotificationPayload, "userId" | "businessId" | "role">,
  executor: Queryable = pool,
) {
  try {
    await createNotificationsForAdminGeneral(payload, executor);
    return true;
  } catch (error) {
    console.error(
      "[notifications] no se pudieron guardar notificaciones para admin_general:",
      {
        type: payload.type,
        title: payload.title,
        relatedId: normalizeId(payload.relatedId),
        error: serializeNotificationError(error),
      },
    );
    return false;
  }
}

function buildActorFilter(actor: NotificationActor) {
  const filters: string[] = ["user_id = ?"];
  const values: Array<number | string> = [actor.userId];

  const businessIds = Array.from(
    new Set(
      (actor.businessIds ?? []).map((id) => normalizeId(id)).filter(Boolean),
    ),
  ) as number[];

  if (businessIds.length > 0) {
    filters.push(`business_id IN (${businessIds.map(() => "?").join(", ")})`);
    values.push(...businessIds);
  }

  const roles = Array.from(
    new Set(
      (actor.roles ?? []).map((role) => normalizeRole(role)).filter(Boolean),
    ),
  ) as string[];

  if (roles.length > 0) {
    filters.push(`\`role\` IN (${roles.map(() => "?").join(", ")})`);
    values.push(...roles);
  }

  return {
    sql: filters.map((filter) => `(${filter})`).join(" OR "),
    values,
  };
}

export async function getNotificationsForActor(
  actor: NotificationActor,
  executor: Queryable = pool,
) {
  await ensureNotificationsTable(executor);

  const filter = buildActorFilter(actor);
  const [rows] = await executor.query<NotificationRow[]>(
    `
      SELECT
        id,
        user_id,
        business_id,
        \`role\`,
        type,
        title,
        message,
        related_id,
        is_read,
        data_json,
        created_at,
        updated_at
      FROM notifications
      WHERE ${filter.sql}
      ORDER BY created_at DESC, id DESC
    `,
    filter.values,
  );

  return rows.map((row) => ({
    id: Number(row.id),
    user_id: normalizeId(row.user_id),
    business_id: normalizeId(row.business_id),
    role: normalizeRole(row.role),
    type: String(row.type),
    title: String(row.title),
    message: String(row.message),
    related_id: normalizeId(row.related_id),
    is_read: Boolean(row.is_read),
    data_json: parseNotificationData(row.data_json),
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  }));
}

export async function markNotificationReadForActor(
  notificationId: number,
  actor: NotificationActor,
  executor: Queryable = pool,
) {
  await ensureNotificationsTable(executor);

  const filter = buildActorFilter(actor);
  const values = [notificationId, ...filter.values];

  const [result] = await executor.query<ResultSetHeader>(
    `
      UPDATE notifications
      SET is_read = 1, updated_at = NOW()
      WHERE id = ?
        AND (${filter.sql})
    `,
    values,
  );

  return result.affectedRows;
}

export async function markAllNotificationsReadForActor(
  actor: NotificationActor,
  executor: Queryable = pool,
) {
  await ensureNotificationsTable(executor);

  const filter = buildActorFilter(actor);
  const [result] = await executor.query<ResultSetHeader>(
    `
      UPDATE notifications
      SET is_read = 1, updated_at = NOW()
      WHERE is_read = 0
        AND (${filter.sql})
    `,
    filter.values,
  );

  return result.affectedRows;
}
