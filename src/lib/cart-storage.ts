export const CART_STORAGE_KEY = "gogi_cart";
export const LEGACY_CART_STORAGE_KEY = "gogi:cart";
export const CART_UPDATED_EVENT = "gogi-cart-updated";

export type StoredCartSnapshotItem = {
  id: string;
  product_id: number;
  business_id?: number | null;
  name: string;
  price: number;
  image_url: string;
  quantity: number;
};

function normalizeStoredItem(
  item: Partial<StoredCartSnapshotItem> & {
    id?: string | number;
    productId?: number;
    product_id?: number;
    businessId?: number;
    business_id?: number;
    nombre?: string;
    name?: string;
    unitPrice?: number;
    price?: number;
    image?: string;
    image_url?: string;
    quantity?: number;
  },
): StoredCartSnapshotItem | null {
  const productId = Number(item.product_id ?? item.productId ?? item.id);
  const quantity = Math.max(0, Number(item.quantity ?? 0));

  if (!Number.isInteger(productId) || productId <= 0 || quantity <= 0) {
    return null;
  }

  return {
    id: String(item.id ?? productId),
    product_id: productId,
    business_id: Number(item.business_id ?? item.businessId ?? 0) || null,
    name: String(item.name ?? item.nombre ?? "").trim(),
    price: Number(item.price ?? item.unitPrice ?? 0) || 0,
    image_url: String(item.image_url ?? item.image ?? "").trim(),
    quantity,
  };
}

export function readStoredCartSnapshot() {
  if (typeof window === "undefined") return [] as StoredCartSnapshotItem[];

  const rawCart =
    window.localStorage.getItem(CART_STORAGE_KEY) ??
    window.localStorage.getItem(LEGACY_CART_STORAGE_KEY);

  if (!rawCart) return [];

  try {
    const parsed = JSON.parse(rawCart) as Array<Record<string, unknown>>;
    return parsed
      .map((item) =>
        normalizeStoredItem(
          item as Partial<StoredCartSnapshotItem> & {
            id?: string | number;
            productId?: number;
            product_id?: number;
            businessId?: number;
            business_id?: number;
            nombre?: string;
            name?: string;
            unitPrice?: number;
            price?: number;
            image?: string;
            image_url?: string;
            quantity?: number;
          },
        ),
      )
      .filter((item): item is StoredCartSnapshotItem => Boolean(item));
  } catch (error) {
    console.error("No se pudo leer el carrito guardado", error);
    return [];
  }
}

export function writeStoredCartSnapshot(items: StoredCartSnapshotItem[]) {
  if (typeof window === "undefined") return;

  window.localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(items));
  window.localStorage.removeItem(LEGACY_CART_STORAGE_KEY);
  window.dispatchEvent(new Event(CART_UPDATED_EVENT));
}

export function getStoredCartCount() {
  return readStoredCartSnapshot().reduce(
    (total, item) => total + Math.max(0, Number(item.quantity) || 0),
    0,
  );
}
