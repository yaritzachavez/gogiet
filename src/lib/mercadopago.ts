import crypto from "node:crypto";

import { getMercadoPagoWebhookSecret } from "@/lib/env";

const MERCADOPAGO_API_BASE_URL = "https://api.mercadopago.com";
const DEFAULT_APP_URL = "https://www.gogieats.shop";
const DEFAULT_WEBHOOK_TOLERANCE_MS = 15 * 60 * 1000;

type MercadoPagoPaymentResponse = {
  id?: number | string;
  status?: string;
  status_detail?: string;
  transaction_amount?: number;
  currency_id?: string;
  payment_method_id?: string;
  payment_type_id?: string;
  external_reference?: string;
  date_approved?: string;
  metadata?: Record<string, unknown>;
  [key: string]: unknown;
};

type CreatePaymentPayload = {
  transaction_amount: number;
  token: string;
  description: string;
  installments: number;
  payment_method_id: string;
  issuer_id?: string | number | null;
  payer: {
    email: string;
    identification?: {
      type: string;
      number: string;
    };
  };
  external_reference: string;
  notification_url?: string;
  metadata?: Record<string, unknown>;
};

type MercadoPagoWebhookSignatureParts = {
  ts: string;
  v1: string;
};

function normalizeWebhookTimestamp(ts: string) {
  const numericTs = Number(ts);
  if (!Number.isFinite(numericTs) || numericTs <= 0) {
    return null;
  }

  return String(Math.trunc(numericTs)).length <= 10
    ? numericTs * 1000
    : numericTs;
}

function parseSignatureHeader(signature: string) {
  const parts = signature.split(",");
  let ts = "";
  let v1 = "";

  for (const part of parts) {
    const [rawKey, rawValue] = part.split("=", 2);
    const key = rawKey?.trim().toLowerCase();
    const value = rawValue?.trim() ?? "";

    if (key === "ts") {
      ts = value;
    } else if (key === "v1") {
      v1 = value.toLowerCase();
    }
  }

  if (!ts || !v1) {
    return null;
  }

  return { ts, v1 } satisfies MercadoPagoWebhookSignatureParts;
}

function buildSignatureManifest(params: {
  dataId: string | null;
  requestId: string | null;
  ts: string;
}) {
  const manifestParts = [
    params.dataId ? `id:${params.dataId.toLowerCase()};` : null,
    params.requestId ? `request-id:${params.requestId};` : null,
    params.ts ? `ts:${params.ts};` : null,
  ].filter(Boolean);

  return manifestParts.join("");
}

export function verifyMercadoPagoWebhookSignature(params: {
  signatureHeader: string | null;
  requestIdHeader: string | null;
  dataId: string | null;
  toleranceMs?: number;
}) {
  const secret = getMercadoPagoWebhookSecret();
  if (!secret) {
    throw new Error(
      "Falta configurar MERCADOPAGO_WEBHOOK_SECRET para validar webhooks.",
    );
  }

  const signatureHeader = String(params.signatureHeader ?? "").trim();
  const requestIdHeader = String(params.requestIdHeader ?? "").trim();
  if (!signatureHeader || !requestIdHeader) {
    return {
      ok: false,
      reason: "missing_headers",
      manifest: null,
      parts: null,
    } as const;
  }

  const parts = parseSignatureHeader(signatureHeader);
  if (!parts) {
    return {
      ok: false,
      reason: "invalid_signature_format",
      manifest: null,
      parts: null,
    } as const;
  }

  const dataId = String(params.dataId ?? "").trim() || null;
  const manifest = buildSignatureManifest({
    dataId,
    requestId: requestIdHeader,
    ts: parts.ts,
  });

  if (!manifest) {
    return {
      ok: false,
      reason: "missing_manifest_data",
      manifest,
      parts,
    } as const;
  }

  const expectedSignature = crypto
    .createHmac("sha256", secret)
    .update(manifest)
    .digest("hex")
    .toLowerCase();

  const expectedBuffer = Buffer.from(expectedSignature, "hex");
  const receivedBuffer = Buffer.from(parts.v1, "hex");

  if (
    expectedBuffer.length === 0 ||
    receivedBuffer.length === 0 ||
    expectedBuffer.length !== receivedBuffer.length ||
    !crypto.timingSafeEqual(expectedBuffer, receivedBuffer)
  ) {
    return {
      ok: false,
      reason: "signature_mismatch",
      manifest,
      parts,
    } as const;
  }

  const toleranceMs = params.toleranceMs ?? DEFAULT_WEBHOOK_TOLERANCE_MS;
  const normalizedTs = normalizeWebhookTimestamp(parts.ts);
  if (!normalizedTs) {
    return {
      ok: false,
      reason: "invalid_timestamp",
      manifest,
      parts,
    } as const;
  }

  if (Math.abs(Date.now() - normalizedTs) > toleranceMs) {
    return {
      ok: false,
      reason: "timestamp_out_of_range",
      manifest,
      parts,
    } as const;
  }

  return {
    ok: true,
    reason: null,
    manifest,
    parts,
    validatedAt: new Date().toISOString(),
  } as const;
}

function getAccessToken() {
  const token = process.env.MERCADOPAGO_ACCESS_TOKEN?.trim();
  if (!token) {
    throw new Error("Falta configurar MERCADOPAGO_ACCESS_TOKEN.");
  }
  return token;
}

export function getAppUrl() {
  const rawUrl = process.env.NEXT_PUBLIC_APP_URL?.trim() || DEFAULT_APP_URL;
  return rawUrl.endsWith("/") ? rawUrl.slice(0, -1) : rawUrl;
}

async function mercadoPagoRequest<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(`${MERCADOPAGO_API_BASE_URL}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${getAccessToken()}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    cache: "no-store",
  });

  const data = (await response.json().catch(() => null)) as T | null;

  if (!response.ok || !data) {
    throw new Error(`Mercado Pago respondió con error (${response.status}).`);
  }

  return data;
}

export async function getMercadoPagoPayment(paymentId: string) {
  return mercadoPagoRequest<MercadoPagoPaymentResponse>(
    `/v1/payments/${encodeURIComponent(paymentId)}`,
  );
}

export async function createMercadoPagoPayment(
  payload: CreatePaymentPayload,
  idempotencyKey: string,
) {
  return mercadoPagoRequest<MercadoPagoPaymentResponse>("/v1/payments", {
    method: "POST",
    headers: {
      "X-Idempotency-Key": idempotencyKey,
    },
    body: JSON.stringify(payload),
  });
}
