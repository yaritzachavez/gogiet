const MERCADOPAGO_API_BASE_URL = "https://api.mercadopago.com";
const DEFAULT_APP_URL = "https://www.gogieats.shop";

type MercadoPagoItem = {
  id?: string;
  title: string;
  quantity: number;
  currency_id: string;
  unit_price: number;
};

type CreatePreferencePayload = {
  items: MercadoPagoItem[];
  external_reference: string;
  notification_url: string;
  back_urls: {
    success: string;
    failure: string;
    pending: string;
  };
  auto_return?: "approved";
  metadata?: Record<string, unknown>;
  payer?: {
    email?: string;
    name?: string;
  };
};

type MercadoPagoPreferenceResponse = {
  id?: string;
  init_point?: string;
  sandbox_init_point?: string;
  [key: string]: unknown;
};

type MercadoPagoPaymentResponse = {
  id?: number | string;
  status?: string;
  status_detail?: string;
  transaction_amount?: number;
  currency_id?: string;
  external_reference?: string;
  metadata?: Record<string, unknown>;
  [key: string]: unknown;
};

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
    throw new Error(
      `Mercado Pago respondió con error (${response.status}).`,
    );
  }

  return data;
}

export async function createMercadoPagoPreference(
  payload: CreatePreferencePayload,
) {
  return mercadoPagoRequest<MercadoPagoPreferenceResponse>(
    "/checkout/preferences",
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
  );
}

export async function getMercadoPagoPayment(paymentId: string) {
  return mercadoPagoRequest<MercadoPagoPaymentResponse>(
    `/v1/payments/${encodeURIComponent(paymentId)}`,
  );
}
