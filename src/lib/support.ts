import jwt from "jsonwebtoken";
import type {
  Pool,
  PoolConnection,
  ResultSetHeader,
  RowDataPacket,
} from "mysql2/promise";
import type { NextRequest } from "next/server";

import pool from "@/lib/db";

type Queryable = Pool | PoolConnection;

export const SUPPORT_ROLES = [
  "cliente",
  "repartidor",
  "vendedor",
  "negocio",
  "admin_general",
  "system",
] as const;

export type SupportRole = (typeof SUPPORT_ROLES)[number];
export type SupportConversationStatus = "open" | "pending" | "closed";

type JwtPayload = {
  id: number;
  roles?: string[];
  name?: string;
};

type SupportConversationRow = RowDataPacket & {
  id: number;
  requester_user_id: number;
  requester_role: SupportRole;
  assigned_admin_id: number | null;
  status: SupportConversationStatus;
  subject: string | null;
  created_at: string;
  updated_at: string;
  requester_name?: string | null;
  requester_email?: string | null;
  last_message?: string | null;
  last_message_at?: string | null;
  last_attachment_url?: string | null;
  unread_count?: number;
};

type SupportMessageRow = RowDataPacket & {
  id: number;
  conversation_id: number | null;
  sender_user_id: number | null;
  sender_role: SupportRole | null;
  message: string;
  attachment_url: string | null;
  is_read: number | boolean;
  message_type: string;
  created_at: string;
};

export type SupportAuthUser = {
  token: string;
  userId: number;
  name: string | null;
  dbRoles: string[];
  supportRoles: SupportRole[];
  isAdminGeneral: boolean;
};

const DB_ROLE_TO_SUPPORT_ROLE: Record<string, SupportRole | null> = {
  admin_general: "admin_general",
  admin: "admin_general",
  administrator: "admin_general",
  administrador: "admin_general",
  administrador_general: "admin_general",
  cliente: "cliente",
  repartidor: "repartidor",
  delivery: "repartidor",
  driver: "repartidor",
  business_admin: "negocio",
  business_staff: "vendedor",
};

const SUPPORT_ROLE_ALIASES: Record<string, SupportRole> = {
  admin_general: "admin_general",
  ADMIN_GENERAL: "admin_general",
  administrador_general: "admin_general",
  ADMINISTRADOR_GENERAL: "admin_general",
  administrator: "admin_general",
  ADMINISTRATOR: "admin_general",
  administrador: "admin_general",
  ADMINISTRADOR: "admin_general",
  cliente: "cliente",
  CLIENTE: "cliente",
  user: "cliente",
  USER: "cliente",
  repartidor: "repartidor",
  REPARTIDOR: "repartidor",
  delivery: "repartidor",
  DELIVERY: "repartidor",
  driver: "repartidor",
  DRIVER: "repartidor",
  vendedor: "vendedor",
  VENDEDOR: "vendedor",
  business_staff: "vendedor",
  negocio: "negocio",
  NEGOCIO: "negocio",
  business_admin: "negocio",
  admin: "admin_general",
  ADMIN: "admin_general",
  system: "system",
  SYSTEM: "system",
};

function normalizeSupportRole(value: unknown): SupportRole | null {
  const normalized = String(value ?? "").trim();
  if (!normalized) return null;

  return SUPPORT_ROLE_ALIASES[normalized] ?? null;
}

function uniqueSupportRoles(values: Array<SupportRole | null | undefined>) {
  return Array.from(
    new Set(values.filter((value): value is SupportRole => Boolean(value))),
  );
}

function getSupportRoleVariants(role: SupportRole | null | undefined) {
  if (!role) return [];

  const variants = new Set<string>([role]);

  if (role === "repartidor") {
    variants.add("delivery");
    variants.add("driver");
  }

  if (role === "cliente") {
    variants.add("user");
  }

  if (role === "vendedor") {
    variants.add("business_staff");
  }

  if (role === "negocio") {
    variants.add("business_admin");
  }

  return Array.from(variants);
}

function buildRoleFilterSql(columnName: string, roles: string[]) {
  if (roles.length === 0) {
    return null;
  }

  return `${columnName} IN (${roles.map(() => "?").join(", ")})`;
}

async function getUserDbRoles(userId: number, executor: Queryable = pool) {
  const [rows] = await executor.query<RowDataPacket[]>(
    `
      SELECT r.name
      FROM user_roles ur
      INNER JOIN roles r ON r.id = ur.role_id
      WHERE ur.user_id = ?
      ORDER BY ur.assigned_at ASC
    `,
    [userId],
  );

  return rows
    .map((row) => String(row.name ?? "").trim())
    .filter((role) => role.length > 0);
}

function getTokenFromRequest(req: NextRequest) {
  const auth = req.headers.get("authorization");

  if (auth?.startsWith("Bearer ")) {
    return auth.split(" ")[1];
  }

  return req.cookies.get("authToken")?.value ?? null;
}

export async function getSupportAuthUser(
  req: NextRequest,
  executor: Queryable = pool,
): Promise<SupportAuthUser | null> {
  const token = getTokenFromRequest(req);
  if (!token) return null;

  try {
    const payload = jwt.verify(
      token,
      process.env.JWT_SECRET || "gogi-dev-secret",
    ) as JwtPayload;

    const userId = Number(payload.id);
    if (!Number.isInteger(userId) || userId <= 0) {
      return null;
    }

    const tokenRoles = Array.isArray(payload.roles)
      ? payload.roles.map((role) => String(role))
      : [];
    const dbRoles = tokenRoles.length
      ? tokenRoles
      : await getUserDbRoles(userId, executor);
    const normalizedDbRoles = Array.from(
      new Set(
        dbRoles.flatMap((role) => {
          const trimmedRole = String(role).trim();
          const normalizedRole = normalizeSupportRole(trimmedRole);

          return normalizedRole === "admin_general"
            ? [trimmedRole, "admin_general"]
            : [trimmedRole];
        }),
      ),
    );
    const supportRoles = uniqueSupportRoles(
      normalizedDbRoles.map((role) => DB_ROLE_TO_SUPPORT_ROLE[role] ?? null),
    );
    const isAdminGeneral = normalizedDbRoles.some(
      (role) => DB_ROLE_TO_SUPPORT_ROLE[role] === "admin_general",
    );

    console.log("SUPPORT AUTH USER", {
      userId,
      name: payload.name ? String(payload.name) : null,
      tokenRoles,
    });
    console.log("SUPPORT USER ROLES", normalizedDbRoles);

    return {
      token,
      userId,
      name: payload.name ? String(payload.name) : null,
      dbRoles: normalizedDbRoles,
      supportRoles,
      isAdminGeneral,
    };
  } catch (error) {
    console.error("Error validando JWT de soporte:", error);
    return null;
  }
}

export function resolveRequestedSupportRole(
  authUser: SupportAuthUser,
  requestedRole?: unknown,
) {
  const normalizedRole = normalizeSupportRole(requestedRole);

  if (authUser.isAdminGeneral) {
    return normalizedRole === "system"
      ? null
      : (normalizedRole ?? "admin_general");
  }

  if (normalizedRole && authUser.supportRoles.includes(normalizedRole)) {
    return normalizedRole;
  }

  return authUser.supportRoles.find((role) => role !== "admin_general") ?? null;
}

async function ensureTableColumns(
  tableName: string,
  expectedColumns: Array<{ name: string; definition: string }>,
  executor: Queryable = pool,
) {
  const [rows] = await executor.query<RowDataPacket[]>(
    `
      SELECT COLUMN_NAME
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = ?
    `,
    [tableName],
  );

  const availableColumns = new Set(
    rows.map((row) => String(row.COLUMN_NAME ?? "")),
  );

  for (const column of expectedColumns) {
    if (availableColumns.has(column.name)) {
      continue;
    }

    await executor.query(
      `ALTER TABLE ${tableName} ADD COLUMN ${column.name} ${column.definition}`,
    );
  }
}

export async function ensureSupportTables(executor: Queryable = pool) {
  await executor.query(
    `
      CREATE TABLE IF NOT EXISTS support_conversations (
        id INT AUTO_INCREMENT PRIMARY KEY,
        requester_user_id INT NOT NULL,
        requester_role VARCHAR(30) NOT NULL,
        assigned_admin_id INT NULL,
        status VARCHAR(20) NOT NULL DEFAULT 'open',
        subject VARCHAR(255) NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_support_conversations_requester (requester_user_id, requester_role),
        INDEX idx_support_conversations_status (status),
        INDEX idx_support_conversations_admin (assigned_admin_id)
      )
    `,
  );

  await executor.query(
    `
      CREATE TABLE IF NOT EXISTS support_messages (
        id INT AUTO_INCREMENT PRIMARY KEY,
        conversation_id INT NULL,
        thread_id INT NULL,
        sender_user_id INT NULL,
        sender_id INT NULL,
        sender_role VARCHAR(30) NULL,
        sender_type VARCHAR(20) NULL,
        message TEXT NOT NULL,
        attachment_url MEDIUMTEXT NULL,
        file_url MEDIUMTEXT NULL,
        is_read BOOLEAN NOT NULL DEFAULT FALSE,
        message_type VARCHAR(30) NOT NULL DEFAULT 'text',
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_support_messages_conversation (conversation_id),
        INDEX idx_support_messages_thread (thread_id),
        INDEX idx_support_messages_sender_user (sender_user_id),
        INDEX idx_support_messages_is_read (is_read)
      )
    `,
  );

  await ensureTableColumns(
    "support_conversations",
    [
      { name: "requester_user_id", definition: "INT NOT NULL" },
      {
        name: "requester_role",
        definition: "VARCHAR(30) NOT NULL DEFAULT 'cliente'",
      },
      { name: "assigned_admin_id", definition: "INT NULL" },
      { name: "status", definition: "VARCHAR(20) NOT NULL DEFAULT 'open'" },
      { name: "subject", definition: "VARCHAR(255) NULL" },
      {
        name: "created_at",
        definition: "DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP",
      },
      {
        name: "updated_at",
        definition:
          "DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP",
      },
    ],
    executor,
  );

  await ensureTableColumns(
    "support_messages",
    [
      { name: "conversation_id", definition: "INT NULL" },
      { name: "thread_id", definition: "INT NULL" },
      { name: "sender_user_id", definition: "INT NULL" },
      { name: "sender_id", definition: "INT NULL" },
      { name: "sender_role", definition: "VARCHAR(30) NULL" },
      { name: "sender_type", definition: "VARCHAR(20) NULL" },
      { name: "attachment_url", definition: "MEDIUMTEXT NULL" },
      { name: "file_url", definition: "MEDIUMTEXT NULL" },
      { name: "is_read", definition: "BOOLEAN NOT NULL DEFAULT FALSE" },
      {
        name: "message_type",
        definition: "VARCHAR(30) NOT NULL DEFAULT 'text'",
      },
      {
        name: "created_at",
        definition: "DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP",
      },
    ],
    executor,
  );
}

function buildConversationSubject(
  orderId?: number | null,
  subject?: string | null,
) {
  const cleanSubject = String(subject ?? "").trim();
  if (cleanSubject) return cleanSubject;

  return Number.isInteger(orderId) && Number(orderId) > 0
    ? `Pedido #${Number(orderId)}`
    : null;
}

export async function getOrCreateSupportConversation(
  params: {
    requesterUserId: number;
    requesterRole: SupportRole;
    subject?: string | null;
  },
  executor: Queryable = pool,
) {
  await ensureSupportTables(executor);

  const [rows] = await executor.query<SupportConversationRow[]>(
    `
      SELECT id, subject
      FROM support_conversations
      WHERE requester_user_id = ?
        AND status IN ('open', 'pending')
      ORDER BY updated_at DESC, id DESC
      LIMIT 1
    `,
    [params.requesterUserId],
  );

  const existingConversation = rows[0];
  const cleanSubject = String(params.subject ?? "").trim() || null;

  if (existingConversation?.id) {
    if (!existingConversation.subject && cleanSubject) {
      await executor.query(
        `
          UPDATE support_conversations
          SET subject = ?, updated_at = NOW()
          WHERE id = ?
        `,
        [cleanSubject, existingConversation.id],
      );
    }

    return Number(existingConversation.id);
  }

  const [result] = await executor.query<ResultSetHeader>(
    `
      INSERT INTO support_conversations (
        requester_user_id,
        requester_role,
        status,
        subject,
        created_at,
        updated_at
      )
      VALUES (?, ?, 'open', ?, NOW(), NOW())
    `,
    [params.requesterUserId, params.requesterRole, cleanSubject],
  );

  return result.insertId;
}

export async function getOrCreateSupportThread(
  {
    userId,
    orderId = null,
    requesterRole = "cliente",
    subject = null,
  }: {
    userId: number;
    orderId?: number | null;
    requesterRole?: SupportRole;
    status?: "open" | "closed";
    subject?: string | null;
  },
  executor: Queryable = pool,
) {
  return await getOrCreateSupportConversation(
    {
      requesterUserId: userId,
      requesterRole,
      subject: buildConversationSubject(orderId, subject),
    },
    executor,
  );
}

export async function addSupportMessage(
  {
    conversationId,
    threadId,
    senderUserId = null,
    senderId = null,
    senderRole,
    senderType,
    message,
    attachmentUrl = null,
    fileUrl = null,
    messageType = "text",
  }: {
    conversationId?: number | null;
    threadId?: number | null;
    senderUserId?: number | null;
    senderId?: number | null;
    senderRole?: SupportRole | null;
    senderType?: "user" | "admin" | "system";
    message: string;
    attachmentUrl?: string | null;
    fileUrl?: string | null;
    messageType?: "text" | "image" | "payment_proof";
  },
  executor: Queryable = pool,
) {
  await ensureSupportTables(executor);

  const targetConversationId = Number(conversationId ?? threadId ?? 0);
  const cleanMessage = String(message ?? "").trim();

  if (!Number.isInteger(targetConversationId) || targetConversationId <= 0) {
    throw new Error("Conversación inválida para guardar mensaje.");
  }

  if (!cleanMessage) {
    return;
  }

  const resolvedSenderRole =
    senderRole ??
    normalizeSupportRole(senderType === "admin" ? "admin_general" : senderType);
  const resolvedSenderUserId = senderUserId ?? senderId ?? null;
  const resolvedAttachmentUrl =
    String(attachmentUrl ?? fileUrl ?? "").trim() || null;

  await executor.query(
    `
      INSERT INTO support_messages (
        conversation_id,
        thread_id,
        sender_user_id,
        sender_id,
        sender_role,
        sender_type,
        message,
        attachment_url,
        file_url,
        is_read,
        message_type,
        created_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, FALSE, ?, NOW())
    `,
    [
      targetConversationId,
      targetConversationId,
      resolvedSenderUserId,
      resolvedSenderUserId,
      resolvedSenderRole,
      senderType ??
        (resolvedSenderRole === "admin_general"
          ? "admin"
          : resolvedSenderRole === "system"
            ? "system"
            : "user"),
      cleanMessage,
      resolvedAttachmentUrl,
      resolvedAttachmentUrl,
      messageType,
    ],
  );

  const nextStatus: SupportConversationStatus =
    resolvedSenderRole === "admin_general" ? "pending" : "open";

  await executor.query(
    `
      UPDATE support_conversations
      SET
        status = CASE
          WHEN status = 'closed' THEN 'open'
          ELSE ?
        END,
        assigned_admin_id = CASE
          WHEN ? = 'admin_general' AND assigned_admin_id IS NULL THEN ?
          ELSE assigned_admin_id
        END,
        updated_at = NOW()
      WHERE id = ?
    `,
    [
      nextStatus,
      resolvedSenderRole,
      resolvedSenderRole === "admin_general" ? resolvedSenderUserId : null,
      targetConversationId,
    ],
  );
}

async function getConversationById(
  conversationId: number,
  executor: Queryable = pool,
) {
  const [rows] = await executor.query<SupportConversationRow[]>(
    `
      SELECT *
      FROM support_conversations
      WHERE id = ?
      LIMIT 1
    `,
    [conversationId],
  );

  return rows[0] ?? null;
}

export async function canAccessSupportConversation(
  authUser: SupportAuthUser,
  conversationId: number,
  executor: Queryable = pool,
) {
  const conversation = await getConversationById(conversationId, executor);
  if (!conversation) return null;

  if (authUser.isAdminGeneral) {
    return conversation;
  }

  if (Number(conversation.requester_user_id) !== authUser.userId) {
    return null;
  }

  return conversation;
}

function getUnreadConditionForViewer(isAdminGeneral: boolean) {
  return isAdminGeneral
    ? "sm.is_read = FALSE AND COALESCE(sm.sender_role, '') NOT IN ('admin_general', 'system')"
    : "sm.is_read = FALSE AND COALESCE(sm.sender_role, '') = 'admin_general'";
}

export async function listSupportConversations(
  authUser: SupportAuthUser,
  options?: {
    role?: SupportRole | null;
    status?: SupportConversationStatus | "all" | null;
    mineOnly?: boolean;
  },
  executor: Queryable = pool,
) {
  await ensureSupportTables(executor);

  const filters: string[] = [];
  const values: Array<string | number> = [];

  if (!authUser.isAdminGeneral) {
    filters.push("sc.requester_user_id = ?");
    values.push(authUser.userId);

    if (options?.role) {
      const roleVariants = getSupportRoleVariants(options.role);
      const roleFilter = buildRoleFilterSql("sc.requester_role", roleVariants);

      if (roleFilter) {
        filters.push(roleFilter);
        values.push(...roleVariants);
      }
    } else if (authUser.supportRoles.length > 0) {
      const roleVariants = Array.from(
        new Set(
          authUser.supportRoles.flatMap((role) => getSupportRoleVariants(role)),
        ),
      );
      const roleFilter = buildRoleFilterSql("sc.requester_role", roleVariants);

      if (roleFilter) {
        filters.push(roleFilter);
        values.push(...roleVariants);
      }
    }
  } else if (options?.role && options.role !== "admin_general") {
    const roleVariants = getSupportRoleVariants(options.role);
    const roleFilter = buildRoleFilterSql("sc.requester_role", roleVariants);

    if (roleFilter) {
      filters.push(roleFilter);
      values.push(...roleVariants);
    }
  }

  if (
    options?.status &&
    options.status !== "all" &&
    ["open", "pending", "closed"].includes(options.status)
  ) {
    filters.push("sc.status = ?");
    values.push(options.status);
  }

  const whereClause = filters.length ? `WHERE ${filters.join(" AND ")}` : "";
  const unreadCondition = getUnreadConditionForViewer(authUser.isAdminGeneral);

  const [rows] = await executor.query<SupportConversationRow[]>(
    `
      SELECT
        sc.id,
        sc.requester_user_id,
        sc.requester_role,
        sc.assigned_admin_id,
        sc.status,
        sc.subject,
        sc.created_at,
        sc.updated_at,
        TRIM(CONCAT_WS(' ', u.first_name, u.last_name)) AS requester_name,
        u.email AS requester_email,
        last_message.message AS last_message,
        last_message.created_at AS last_message_at,
        COALESCE(last_message.attachment_url, last_message.file_url) AS last_attachment_url,
        (
          SELECT COUNT(*)
          FROM support_messages sm
          WHERE sm.conversation_id = sc.id
            AND ${unreadCondition}
        ) AS unread_count
      FROM support_conversations sc
      INNER JOIN users u ON u.id = sc.requester_user_id
      LEFT JOIN support_messages last_message ON last_message.id = (
        SELECT sm2.id
        FROM support_messages sm2
        WHERE sm2.conversation_id = sc.id
        ORDER BY sm2.created_at DESC, sm2.id DESC
        LIMIT 1
      )
      ${whereClause}
      ORDER BY COALESCE(last_message.created_at, sc.updated_at, sc.created_at) DESC, sc.id DESC
    `,
    values,
  );

  return rows.map((row) => ({
    id: Number(row.id),
    requester_user_id: Number(row.requester_user_id),
    requester_role: row.requester_role,
    assigned_admin_id:
      row.assigned_admin_id === null || row.assigned_admin_id === undefined
        ? null
        : Number(row.assigned_admin_id),
    status: row.status,
    subject: row.subject,
    created_at: row.created_at,
    updated_at: row.updated_at,
    requester_name: row.requester_name || "Usuario sin nombre",
    requester_email: row.requester_email || "",
    last_message: row.last_message || "",
    last_message_at: row.last_message_at,
    last_attachment_url: row.last_attachment_url || null,
    unread_count: Number(row.unread_count ?? 0),
  }));
}

export async function getSupportConversationDetail(
  authUser: SupportAuthUser,
  conversationId: number,
  executor: Queryable = pool,
) {
  await ensureSupportTables(executor);

  const conversation = await canAccessSupportConversation(
    authUser,
    conversationId,
    executor,
  );

  if (!conversation) {
    return null;
  }

  const [rows] = await executor.query<SupportConversationRow[]>(
    `
      SELECT
        sc.id,
        sc.requester_user_id,
        sc.requester_role,
        sc.assigned_admin_id,
        sc.status,
        sc.subject,
        sc.created_at,
        sc.updated_at,
        TRIM(CONCAT_WS(' ', u.first_name, u.last_name)) AS requester_name,
        u.email AS requester_email
      FROM support_conversations sc
      INNER JOIN users u ON u.id = sc.requester_user_id
      WHERE sc.id = ?
      LIMIT 1
    `,
    [conversationId],
  );

  return rows[0] ?? null;
}

export async function getSupportConversationMessages(
  authUser: SupportAuthUser,
  conversationId: number,
  executor: Queryable = pool,
) {
  const conversation = await canAccessSupportConversation(
    authUser,
    conversationId,
    executor,
  );

  if (!conversation) {
    return null;
  }

  const [rows] = await executor.query<SupportMessageRow[]>(
    `
      SELECT
        id,
        conversation_id,
        sender_user_id,
        sender_role,
        message,
        COALESCE(attachment_url, file_url) AS attachment_url,
        is_read,
        message_type,
        created_at
      FROM support_messages
      WHERE conversation_id = ?
      ORDER BY created_at ASC, id ASC
    `,
    [conversationId],
  );

  const markReadCondition = authUser.isAdminGeneral
    ? "COALESCE(sender_role, '') NOT IN ('admin_general', 'system')"
    : "COALESCE(sender_role, '') = 'admin_general'";

  await executor.query(
    `
      UPDATE support_messages
      SET is_read = TRUE
      WHERE conversation_id = ?
        AND ${markReadCondition}
    `,
    [conversationId],
  );

  return rows.map((row) => ({
    id: Number(row.id),
    conversation_id:
      row.conversation_id === null || row.conversation_id === undefined
        ? null
        : Number(row.conversation_id),
    sender_user_id:
      row.sender_user_id === null || row.sender_user_id === undefined
        ? null
        : Number(row.sender_user_id),
    sender_role: row.sender_role,
    message: String(row.message),
    attachment_url: row.attachment_url,
    is_read: Boolean(row.is_read),
    message_type: String(row.message_type ?? "text"),
    created_at: String(row.created_at),
  }));
}

export async function updateSupportConversationStatus(
  authUser: SupportAuthUser,
  conversationId: number,
  status: SupportConversationStatus,
  executor: Queryable = pool,
) {
  if (!authUser.isAdminGeneral) {
    throw new Error("Solo ADMIN_GENERAL puede cambiar el estado.");
  }

  await ensureSupportTables(executor);

  await executor.query(
    `
      UPDATE support_conversations
      SET status = ?, updated_at = NOW()
      WHERE id = ?
    `,
    [status, conversationId],
  );
}
