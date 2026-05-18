import type {
  Pool,
  PoolConnection,
  ResultSetHeader,
  RowDataPacket,
} from "mysql2/promise";
import {
  assertColumnsExist,
  assertIndexesExist,
  assertTablesExist,
} from "@/lib/runtime-schema";

type Queryable = Pool | PoolConnection;

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
    "provider",
    "provider_payment_id",
    "webhook_event_id",
    "status",
    "amount",
    "currency",
    "raw_event",
    "raw_response",
    "signature_validated_at",
    "processed_at",
    "created_at",
    "updated_at",
  ]);
  await assertIndexesExist(conn, "payments", [
    "idx_payments_order_id",
    "idx_payments_provider",
    "idx_payments_provider_payment_id",
    "idx_payments_webhook_event_id",
  ]);
}

type UpsertPaymentRecordInput = {
  orderId: number;
  provider: string;
  providerPaymentId?: string | null;
  webhookEventId?: string | null;
  status: string;
  amount: number;
  currency?: string | null;
  rawEvent?: unknown;
  rawResponse?: unknown;
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

export async function upsertPaymentRecord(
  conn: Queryable,
  input: UpsertPaymentRecordInput,
) {
  await ensurePaymentsTable(conn);

  const providerPaymentId =
    typeof input.providerPaymentId === "string" &&
    input.providerPaymentId.trim().length > 0
      ? input.providerPaymentId.trim()
      : null;
  const webhookEventId =
    typeof input.webhookEventId === "string" &&
    input.webhookEventId.trim().length > 0
      ? input.webhookEventId.trim()
      : null;

  const serializedRawEvent =
    input.rawEvent == null ? null : JSON.stringify(input.rawEvent);
  const serializedRawResponse =
    input.rawResponse == null ? null : JSON.stringify(input.rawResponse);
  const signatureValidatedAt = normalizeDatetimeInput(
    input.signatureValidatedAt,
  );
  const processedAt = normalizeDatetimeInput(input.processedAt);

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
        input.provider,
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
            provider_payment_id = COALESCE(?, provider_payment_id),
            webhook_event_id = COALESCE(?, webhook_event_id),
            status = ?,
            amount = ?,
            currency = ?,
            raw_event = COALESCE(?, raw_event),
            raw_response = ?,
            signature_validated_at = COALESCE(?, signature_validated_at),
            processed_at = COALESCE(?, processed_at),
            updated_at = NOW()
          WHERE id = ?
        `,
        [
          input.orderId,
          providerPaymentId,
          webhookEventId,
          input.status,
          input.amount,
          input.currency ?? "MXN",
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

  const [latestRows] = await conn.query<RowDataPacket[]>(
    `
      SELECT id
      FROM payments
      WHERE order_id = ? AND provider = ?
      ORDER BY id DESC
      LIMIT 1
    `,
    [input.orderId, input.provider],
  );

  if (latestRows[0]?.id) {
    await conn.query(
      `
        UPDATE payments
        SET
          provider_payment_id = COALESCE(?, provider_payment_id),
          webhook_event_id = COALESCE(?, webhook_event_id),
          status = ?,
          amount = ?,
          currency = ?,
          raw_event = COALESCE(?, raw_event),
          raw_response = ?,
          signature_validated_at = COALESCE(?, signature_validated_at),
          processed_at = COALESCE(?, processed_at),
          updated_at = NOW()
        WHERE id = ?
      `,
      [
        providerPaymentId,
        webhookEventId,
        input.status,
        input.amount,
        input.currency ?? "MXN",
        serializedRawEvent,
        serializedRawResponse,
        signatureValidatedAt,
        processedAt,
        latestRows[0].id,
      ],
    );

    return Number(latestRows[0].id);
  }

  const [result] = await conn.query<ResultSetHeader>(
    `
      INSERT INTO payments (
        order_id,
        provider,
        provider_payment_id,
        webhook_event_id,
        status,
        amount,
        currency,
        raw_event,
        raw_response,
        signature_validated_at,
        processed_at,
        created_at,
        updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
    `,
    [
      input.orderId,
      input.provider,
      providerPaymentId,
      webhookEventId,
      input.status,
      input.amount,
      input.currency ?? "MXN",
      serializedRawEvent,
      serializedRawResponse,
      signatureValidatedAt,
      processedAt,
    ],
  );

  return result.insertId;
}
