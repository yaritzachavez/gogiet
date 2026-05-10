export const CART_STORAGE_KEY = "gogi_cart";
export const LEGACY_CART_STORAGE_KEY = "gogi:cart";
export const CART_UPDATED_EVENT = "gogi-cart-updated";

export type StoredCartSnapshotItem = {
  id: string;
  product_id: number;
  business_id?: number | null;
  business_name?: string;
  name: string;
  description?: string;
  category_name?: string;
  price: number;
  unit_price?: number;
  image_url: string;
  quantity: number;
  subtotal?: number;
  notes?: string;
  customizations_summary?: string;
};

function normalizeStoredItem(
  item: Partial<StoredCartSnapshotItem> & {
    id?: string | number;
    productId?: number;
    product_id?: number;
    businessId?: number;
    business_id?: number;
    business_name?: string;
    businessName?: string;
    nombre?: string;
    name?: string;
    description?: string;
    description_short?: string;
    descriptionShort?: string;
    category_name?: string;
    categoryName?: string;
    unitPrice?: number;
    unit_price?: number;
    price?: number;
    sale_price?: number;
    offer_price?: number;
    discount_price?: number;
    image?: string;
    image_url?: string;
    quantity?: number;
    subtotal?: number;
    notes?: string;
    customizations_summary?: string;
  },
): StoredCartSnapshotItem | null {
  const productId = Number(item.product_id ?? item.productId ?? item.id);
  const quantity = Math.max(0, Number(item.quantity ?? 0));
  const normalizedUnitPrice = Number(
    item.unit_price ??
      item.unitPrice ??
      item.price ??
      item.sale_price ??
      item.offer_price ??
      item.discount_price ??
      0,
  );

  if (!Number.isInteger(productId) || productId <= 0 || quantity <= 0) {
    return null;
  }

  return {
    id: String(item.id ?? productId),
    product_id: productId,
    business_id: Number(item.business_id ?? item.businessId ?? 0) || null,
    business_name: String(item.business_name ?? item.businessName ?? "").trim(),
    name: String(item.name ?? item.nombre ?? "").trim(),
    description: String(
      item.description ?? item.description_short ?? item.descriptionShort ?? "",
    ).trim(),
    category_name: String(item.category_name ?? item.categoryName ?? "").trim(),
    price: Number.isFinite(normalizedUnitPrice) ? normalizedUnitPrice : 0,
    unit_price: Number.isFinite(normalizedUnitPrice) ? normalizedUnitPrice : 0,
    image_url: String(item.image_url ?? item.image ?? "").trim(),
    quantity,
    subtotal: Number(
      (
        Number(
          item.subtotal ??
            (Number.isFinite(normalizedUnitPrice) ? normalizedUnitPrice : 0) *
              quantity,
        ) || 0
      ).toFixed(2),
    ),
    notes: String(item.notes ?? "").trim(),
    customizations_summary: String(item.customizations_summary ?? "").trim(),
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
            business_name?: string;
            businessName?: string;
            nombre?: string;
            name?: string;
            description?: string;
            description_short?: string;
            descriptionShort?: string;
            category_name?: string;
            categoryName?: string;
            unitPrice?: number;
            unit_price?: number;
            price?: number;
            sale_price?: number;
            offer_price?: number;
            discount_price?: number;
            image?: string;
            image_url?: string;
            quantity?: number;
            subtotal?: number;
            notes?: string;
            customizations_summary?: string;
          },
        ),
      )
      .filter((item): item is StoredCartSnapshotItem => Boolean(item));
  } catch (error) {
    console.warn("No se pudo leer el carrito guardado", error);
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
