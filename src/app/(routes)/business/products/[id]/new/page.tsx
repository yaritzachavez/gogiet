// ❌ NO pongas "use client" aquí

import NewProductClient from "./components/NewProductClient";

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return <NewProductClient businessId={Number(id)} />;
}
