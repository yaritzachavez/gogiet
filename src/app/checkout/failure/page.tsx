import { redirect } from "next/navigation";

type CheckoutReturnPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function readString(value: string | string[] | undefined) {
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
}

export default async function CheckoutFailurePage({
  searchParams,
}: CheckoutReturnPageProps) {
  const params = searchParams ? await searchParams : {};
  const orderId = readString(params.orderId);
  const message = readString(params.message);

  redirect(
    `/payments/mercadopago/status?status=failure${
      orderId ? `&orderId=${encodeURIComponent(orderId)}` : ""
    }${message ? `&message=${encodeURIComponent(message)}` : ""}`,
  );
}
