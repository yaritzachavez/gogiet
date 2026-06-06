import type {
  Pool,
  PoolConnection,
  ResultSetHeader,
  RowDataPacket,
} from "mysql2/promise";
import {
  assertColumnsExist,
  assertTablesExist,
  RuntimeSchemaError,
} from "@/lib/runtime-schema";

type Queryable = Pool | PoolConnection;
type PaymentIndexRow = RowDataPacket & {
  Key_name?: string;
  Column_name?: string;
};

async function ensurePaymentsIndexes(conn: Queryable) {
  const [rows] = await conn.query<PaymentIndexRow[]>(
    "SHOW INDEX FROM payments",
  );
  const columnsByIndex = new Map<string, Set<string>>();

  for (const row of rows) {
    const keyName = String(row.Key_name ?? "").trim();
    const columnName = String(row.Column_name ?? "")
      .trim()
      .toLowerCase();

    if (!keyName || !columnName) {
      continue;
    }

    if (!columnsByIndex.has(keyName)) {
      columnsByIndex.set(keyName, new Set());
    }

    columnsByIndex.get(keyName)?.add(columnName);
  }

  const hasOrderIdIndex = Array.from(columnsByIndex.values()).some(
    (columns) => columns.size === 1 && columns.has("order_id"),
  );
  const hasProviderIndex = Array.from(columnsByIndex.values()).some(
    (columns) => columns.size === 1 && columns.has("provider"),
  );
  const hasProviderPaymentIdIndex = Array.from(columnsByIndex.values()).some(
    (columns) => columns.size === 1 && columns.has("provider_payment_id"),
  );
  const hasWebhookEventIdIndex = Array.from(columnsByIndex.values()).some(
    (columns) => columns.size === 1 && columns.has("webhook_event_id"),
  );

  const missingIndexes = [
    !hasOrderIdIndex ? "order_id" : null,
    !hasProviderIndex ? "provider" : null,
    !hasProviderPaymentIdIndex ? "provider_payment_id" : null,
    !hasWebhookEventIdIndex ? "webhook_event_id" : null,
  ].filter(Boolean) as string[];

  if (missingIndexes.length > 0) {
    throw new RuntimeSchemaError(
      `Faltan índices equivalentes en payments: ${missingIndexes.join(", ")}.`,
    );
  }
}

export async function ensureOrderPaymentColumns(conn: Queryable) {
  await assertTablesExist(conn, ["orders"]);
  await assertColumnsExist(conn, "orders", [
    "payment_provider",
    "provider_payment_id",
    "payment_status",
    "paid_at",
    "amount_paid",
  ]);
}

export async function ensurePaymentsTable(conn: Queryable) {
  await assertTablesExist(conn, ["payments"]);
  await assertColumnsExist(conn, "payments", [
    "id",
    "order_id",
    "payment_method_id",
    "payment_status",
    "transaction_reference",
    "provider_name",
    "provider",
    "provider_payment_id",
    "webhook_event_id",
    "status",
    "amount",
    "currency",
    "paid_at",
    "raw_event",
    "raw_response",
    "signature_validated_at",
    "processed_at",
    "created_at",
    "updated_at",
  ]);
  await ensurePaymentsIndexes(conn);
}

type UpsertPaymentRecordInput = {
  id?: number;
  orderId: number;
  paymentMethodId?: number | null;
  paymentStatus?: string | null;
  transactionReference?: string | null;
  providerName?: string | null;
  provider: string;
  providerPaymentId?: string | null;
  webhookEventId?: string | null;
  status: string;
  amount: number;
  currency?: string | null;
  rawEvent?: unknown;
  rawResponse?: unknown;
  paidAt?: string | Date | null;
  signatureValidatedAt?: string | Date | null;
  processedAt?: string | Date | null;
};

function normalizeDatetimeInput(value: string | Date | null | undefined) {
  if (!value) {
    return null;
  }

  if (value instanceof Date) {
    return value;
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function normalizeOptionalString(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function serializeOptionalJson(value: unknown) {
  return value == null ? null : JSON.stringify(value);
}

export async function findPaymentByWebhookEventId(
  conn: Queryable,
  provider: string,
  webhookEventId: string,
) {
  await ensurePaymentsTable(conn);

  const [rows] = await conn.query<RowDataPacket[]>(
    `
      SELECT id, order_id, provider_payment_id, status, processed_at
      FROM payments
      WHERE provider = ? AND webhook_event_id = ?
      ORDER BY id DESC
      LIMIT 1
    `,
    [provider, webhookEventId],
  );

  return rows[0] ?? null;
}

export async function findPaymentByTransactionReference(
  conn: Queryable,
  transactionReference: string,
) {
  await ensurePaymentsTable(conn);

  const [rows] = await conn.query<RowDataPacket[]>(
    `
      SELECT
        id,
        order_id,
        provider,
        provider_payment_id,
        payment_status,
        status,
        processed_at
      FROM payments
      WHERE transaction_reference = ?
      ORDER BY id DESC
      LIMIT 1
    `,
    [transactionReference],
  );

  return rows[0] ?? null;
}

export async function findLatestPaymentForOrder(
  conn: Queryable,
  orderId: number,
  provider?: string | null,
) {
  await ensurePaymentsTable(conn);

  const [rows] = await conn.query<RowDataPacket[]>(
    `
      SELECT
        id,
        order_id,
        payment_method_id,
        payment_status,
        transaction_reference,
        provider_name,
        provider,
        provider_payment_id,
        webhook_event_id,
        status,
        amount,
        currency,
        paid_at,
        processed_at,
        created_at,
        updated_at
      FROM payments
      WHERE order_id = ?
        AND (? IS NULL OR provider = ?)
      ORDER BY id DESC
      LIMIT 1
    `,
    [orderId, provider ?? null, provider ?? null],
  );

  return rows[0] ?? null;
}

export async function findApprovedPaymentForOrder(
  conn: Queryable,
  orderId: number,
  provider?: string | null,
) {
  await ensurePaymentsTable(conn);

  const [rows] = await conn.query<RowDataPacket[]>(
    `
      SELECT
        id,
        order_id,
        provider,
        provider_payment_id,
        payment_status,
        status,
        paid_at,
        processed_at
      FROM payments
      WHERE order_id = ?
        AND (? IS NULL OR provider = ?)
        AND (
          LOWER(COALESCE(payment_status, '')) IN ('approved', 'paid')
          OR LOWER(COALESCE(status, '')) IN ('approved', 'paid')
        )
      ORDER BY id DESC
      LIMIT 1
    `,
    [orderId, provider ?? null, provider ?? null],
  );

  return rows[0] ?? null;
}

export async function upsertPaymentRecord(
  conn: Queryable,
  input: UpsertPaymentRecordInput,
) {
  await ensurePaymentsTable(conn);

  const providerPaymentId = normalizeOptionalString(input.providerPaymentId);
  const webhookEventId = normalizeOptionalString(input.webhookEventId);
  const transactionReference = normalizeOptionalString(
    input.transactionReference,
  );
  const providerName = normalizeOptionalString(input.providerName);
  const paymentStatus =
    normalizeOptionalString(input.paymentStatus) ??
    normalizeOptionalString(input.status) ??
    "unknown";
  const provider =
    normalizeOptionalString(input.provider) ??
    normalizeOptionalString(input.providerName) ??
    "MANUAL";
  const serializedRawEvent = serializeOptionalJson(input.rawEvent);
  const serializedRawResponse = serializeOptionalJson(input.rawResponse);
  const paidAt = normalizeDatetimeInput(input.paidAt);
  const signatureValidatedAt = normalizeDatetimeInput(
    input.signatureValidatedAt,
  );
  const processedAt = normalizeDatetimeInput(input.processedAt);

  if (input.id) {
    await conn.query(
      `
        UPDATE payments
        SET
          order_id = ?,
          payment_method_id = COALESCE(?, payment_method_id),
          payment_status = ?,
          transaction_reference = COALESCE(?, transaction_reference),
          provider_name = COALESCE(?, provider_name),
          provider = COALESCE(?, provider),
          provider_payment_id = COALESCE(?, provider_payment_id),
          webhook_event_id = COALESCE(?, webhook_event_id),
          status = ?,
          amount = ?,
          currency = ?,
          paid_at = COALESCE(?, paid_at),
          raw_event = COALESCE(?, raw_event),
          raw_response = ?,
          signature_validated_at = COALESCE(?, signature_validated_at),
          processed_at = COALESCE(?, processed_at),
          updated_at = NOW()
        WHERE id = ?
      `,
      [
        input.orderId,
        input.paymentMethodId ?? null,
        paymentStatus,
        transactionReference,
        providerName,
        provider,
        providerPaymentId,
        webhookEventId,
        input.status,
        input.amount,
        input.currency ?? "MXN",
        paidAt,
        serializedRawEvent,
        serializedRawResponse,
        signatureValidatedAt,
        processedAt,
        input.id,
      ],
    );

    return input.id;
  }

  if (providerPaymentId || webhookEventId) {
    const [existingRows] = await conn.query<RowDataPacket[]>(
      `
        SELECT id
        FROM payments
        WHERE provider = ?
          AND (
            (? IS NOT NULL AND provider_payment_id = ?)
            OR (? IS NOT NULL AND webhook_event_id = ?)
          )
        LIMIT 1
      `,
      [
        provider,
        providerPaymentId,
        providerPaymentId,
        webhookEventId,
        webhookEventId,
      ],
    );

    if (existingRows[0]?.id) {
      await conn.query(
        `
          UPDATE payments
          SET
            order_id = ?,
            payment_method_id = COALESCE(?, payment_method_id),
            payment_status = ?,
            transaction_reference = COALESCE(?, transaction_reference),
            provider_name = COALESCE(?, provider_name),
            provider = COALESCE(?, provider),
            provider_payment_id = COALESCE(?, provider_payment_id),
            webhook_event_id = COALESCE(?, webhook_event_id),
            status = ?,
            amount = ?,
            currency = ?,
            paid_at = COALESCE(?, paid_at),
            raw_event = COALESCE(?, raw_event),
            raw_response = ?,
            signature_validated_at = COALESCE(?, signature_validated_at),
            processed_at = COALESCE(?, processed_at),
            updated_at = NOW()
          WHERE id = ?
        `,
        [
          input.orderId,
          input.paymentMethodId ?? null,
          paymentStatus,
          transactionReference,
          providerName,
          provider,
          providerPaymentId,
          webhookEventId,
          input.status,
          input.amount,
          input.currency ?? "MXN",
          paidAt,
          serializedRawEvent,
          serializedRawResponse,
          signatureValidatedAt,
          processedAt,
          existingRows[0].id,
        ],
      );

      return Number(existingRows[0].id);
    }
  }

  if (transactionReference) {
    const [existingRows] = await conn.query<RowDataPacket[]>(
      `
        SELECT id
        FROM payments
        WHERE transaction_reference = ?
        LIMIT 1
      `,
      [transactionReference],
    );

    if (existingRows[0]?.id) {
      await conn.query(
        `
          UPDATE payments
          SET
            order_id = ?,
            payment_method_id = COALESCE(?, payment_method_id),
            payment_status = ?,
            provider_name = COALESCE(?, provider_name),
            provider = COALESCE(?, provider),
            provider_payment_id = COALESCE(?, provider_payment_id),
            webhook_event_id = COALESCE(?, webhook_event_id),
            status = ?,
            amount = ?,
            currency = ?,
            paid_at = COALESCE(?, paid_at),
            raw_event = COALESCE(?, raw_event),
            raw_response = ?,
            signature_validated_at = COALESCE(?, signature_validated_at),
            processed_at = COALESCE(?, processed_at),
            updated_at = NOW()
          WHERE id = ?
        `,
        [
          input.orderId,
          input.paymentMethodId ?? null,
          paymentStatus,
          providerName,
          provider,
          providerPaymentId,
          webhookEventId,
          input.status,
          input.amount,
          input.currency ?? "MXN",
          paidAt,
          serializedRawEvent,
          serializedRawResponse,
          signatureValidatedAt,
          processedAt,
          existingRows[0].id,
        ],
      );

      return Number(existingRows[0].id);
    }
  }

  const [result] = await conn.query<ResultSetHeader>(
    `
      INSERT INTO payments (
        order_id,
        payment_method_id,
        payment_status,
        transaction_reference,
        provider_name,
        provider,
        provider_payment_id,
        webhook_event_id,
        status,
        amount,
        currency,
        paid_at,
        raw_event,
        raw_response,
        signature_validated_at,
        processed_at,
        created_at,
        updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
    `,
    [
      input.orderId,
      input.paymentMethodId ?? null,
      paymentStatus,
      transactionReference,
      providerName,
      provider,
      providerPaymentId,
      webhookEventId,
      input.status,
      input.amount,
      input.currency ?? "MXN",
      paidAt,
      serializedRawEvent,
      serializedRawResponse,
      signatureValidatedAt,
      processedAt,
    ],
  );

  return result.insertId;
}
