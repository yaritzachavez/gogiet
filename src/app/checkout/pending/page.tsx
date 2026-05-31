import { redirect } from "next/navigation";

type CheckoutReturnPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function readString(value: string | string[] | undefined) {
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
}

export default async function CheckoutPendingPage({
  searchParams,
}: CheckoutReturnPageProps) {
  const params = searchParams ? await searchParams : {};
  const orderId = readString(params.orderId);

  redirect(
    `/payments/mercadopago/status?status=pending${
      orderId ? `&orderId=${encodeURIComponent(orderId)}` : ""
    }`,
  );
}
