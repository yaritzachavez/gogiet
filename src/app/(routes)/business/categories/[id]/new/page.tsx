import FormClient from "./components/FormClient";

export default async function NewCategoryPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return <FormClient businessId={Number(id)} />; 
}
