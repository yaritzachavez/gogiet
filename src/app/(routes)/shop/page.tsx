import { unstable_noStore as noStore } from "next/cache";

import { getPublicStores, type PublicStore } from "@/lib/public-stores";
import ShopPageClient from "./ShopPageClient";

export default async function ShopPage() {
  noStore();

  let initialStores: PublicStore[] = [];
  let initialStoresError = "";

  try {
    initialStores = await getPublicStores();
  } catch {
    initialStoresError = "No pudimos cargar los aliados por ahora.";
  }

  return (
    <ShopPageClient
      initialStores={initialStores}
      initialStoresError={initialStoresError}
    />
  );
}
