import { redirect } from "next/navigation";

export default async function OrderRedirectPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/pedidos/${id}`);
}
