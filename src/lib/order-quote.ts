export type AuthoritativeShippingZone = {
  id: number;
  nombre: string;
  distanciaKm: number;
  activo: boolean;
};

export type QuoteRequestItem = {
  productId: number;
  quantity: number;
};

export type QuoteProductRecord = {
  id: number;
  name: string;
  businessId: number;
  statusId: number | null;
  isStockAvailable: boolean;
  stockAverage: number;
  price: number;
  discountPrice: number | null;
  minPerOrder?: number | null;
  maxPerOrder?: number | null;
};

export type QuoteAddressInput = {
  neighborhood: string | null;
  latitude?: number | null;
  longitude?: number | null;
};

export type ClientQuoteSnapshot = {
  subtotal?: number | null;
  shippingCost?: number | null;
  deliveryFee?: number | null;
  total?: number | null;
};

type QuoteMoneyBreakdown = ReturnType<typeof calculateOrderCommissionBreakdown>;

export type AuthoritativeOrderQuote = QuoteMoneyBreakdown & {
  businessId: number;
  zoneName: string;
  distanceKm: number;
  items: Array<{
    productId: number;
    productName: string;
    quantity: number;
    unitPrice: number;
    subtotal: number;
  }>;
};

export type QuoteFailureCode =
  | "INVALID_ADDRESS_COORDINATES"
  | "ADDRESS_OUT_OF_COVERAGE"
  | "INVALID_SHIPPING_CONFIGURATION"
  | "INVALID_PRODUCT_QUANTITY"
  | "DUPLICATE_PRODUCT"
  | "PRODUCT_NOT_FOUND"
  | "PRODUCT_INACTIVE"
  | "PRODUCT_OUT_OF_STOCK"
  | "PRODUCT_OUT_OF_BUSINESS"
  | "MULTI_BUSINESS_NOT_ALLOWED"
  | "PRICE_CHANGED"
  | "DELIVERY_FEE_CHANGED"
  | "QUOTE_CHANGED";

export type QuoteFailure = {
  ok: false;
  code: QuoteFailureCode;
  message: string;
  quote?: AuthoritativeOrderQuote;
};

export type QuoteSuccess = {
  ok: true;
  quote: AuthoritativeOrderQuote;
};

export type QuoteResult = QuoteSuccess | QuoteFailure;

const MAZAMITLA_CITY = "Mazamitla";
const MAZAMITLA_STATE = "Jalisco";
const SERVICE_FEE_RATE = 0.05;
const PLATFORM_DELIVERY_FEE_RATE = 0.3;
const DRIVER_DELIVERY_FEE_RATE = 0.7;

function roundMoney(value: number) {
  return Number((Number.isFinite(value) ? value : 0).toFixed(2));
}

function normalizeShippingZoneName(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[.,]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function calculateShippingCost(distanceKm: number) {
  return 25 + distanceKm * 8;
}

function calculateServiceFee(subtotal: number) {
  return roundMoney(subtotal * SERVICE_FEE_RATE);
}

function calculateOrderCommissionBreakdown(params: {
  subtotal: number;
  deliveryFeeOverride: number;
  terminalFee?: number;
  tipAmount?: number;
  discountAmount?: number;
}) {
  const subtotal = roundMoney(params.subtotal);
  const deliveryFee = roundMoney(params.deliveryFeeOverride);
  const serviceFee = calculateServiceFee(subtotal);
  const platformFee = roundMoney(deliveryFee * PLATFORM_DELIVERY_FEE_RATE);
  const driverFee = roundMoney(deliveryFee * DRIVER_DELIVERY_FEE_RATE);
  const terminalFee = roundMoney(params.terminalFee ?? 0);
  const tipAmount = roundMoney(params.tipAmount ?? 0);
  const discountAmount = roundMoney(params.discountAmount ?? 0);
  const total = roundMoney(
    subtotal +
      serviceFee +
      deliveryFee +
      terminalFee +
      tipAmount -
      discountAmount,
  );

  return {
    subtotal,
    serviceFee,
    deliveryFee,
    platformFee,
    driverFee,
    terminalFee,
    tipAmount,
    discountAmount,
    total,
  };
}

function toCents(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) {
    return null;
  }

  return Math.round(value * 100);
}

export function validateCoordinate(value: unknown, min: number, max: number) {
  if (value == null || value === "") {
    return null;
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < min || parsed > max) {
    return Number.NaN;
  }

  return parsed;
}

export function resolveAuthoritativeShippingQuote(params: {
  address: QuoteAddressInput;
  zones: AuthoritativeShippingZone[];
}) {
  const neighborhood = String(params.address.neighborhood ?? "").trim();
  if (!neighborhood) {
    return {
      ok: false as const,
      code: "ADDRESS_OUT_OF_COVERAGE" as const,
      message: "La dirección no tiene una zona de envío válida.",
    };
  }

  const normalizedNeighborhood = normalizeShippingZoneName(neighborhood);
  const zone =
    params.zones.find(
      (candidate) =>
        candidate.activo &&
        normalizeShippingZoneName(candidate.nombre) === normalizedNeighborhood,
    ) ?? null;

  if (!zone) {
    return {
      ok: false as const,
      code: "ADDRESS_OUT_OF_COVERAGE" as const,
      message: "No hay cobertura configurada para esta dirección.",
    };
  }

  const distanceKm = roundMoney(Number(zone.distanciaKm));
  if (!Number.isFinite(distanceKm) || distanceKm <= 0) {
    return {
      ok: false as const,
      code: "INVALID_SHIPPING_CONFIGURATION" as const,
      message:
        "La configuración de envío para esta zona no es válida en este momento.",
    };
  }

  const shippingCost = roundMoney(calculateShippingCost(distanceKm));
  if (!Number.isFinite(shippingCost) || shippingCost <= 0) {
    return {
      ok: false as const,
      code: "INVALID_SHIPPING_CONFIGURATION" as const,
      message:
        "No pudimos calcular una tarifa de envío válida para esta dirección.",
    };
  }

  return {
    ok: true as const,
    zoneName: zone.nombre,
    distanceKm,
    shippingCost,
  };
}

function buildClientQuoteMismatch(params: {
  clientQuote: ClientQuoteSnapshot;
  quote: AuthoritativeOrderQuote;
}): QuoteFailure | null {
  const clientSubtotal = toCents(params.clientQuote.subtotal ?? null);
  const clientShipping = toCents(
    params.clientQuote.shippingCost ?? params.clientQuote.deliveryFee ?? null,
  );
  const clientTotal = toCents(params.clientQuote.total ?? null);
  const quoteSubtotal = toCents(params.quote.subtotal);
  const quoteShipping = toCents(params.quote.deliveryFee);
  const quoteTotal = toCents(params.quote.total);

  if (clientSubtotal != null && clientSubtotal !== quoteSubtotal) {
    return {
      ok: false,
      code: "PRICE_CHANGED",
      message:
        "Los precios del pedido cambiaron. Revisa la cotización actualizada.",
      quote: params.quote,
    };
  }

  if (clientShipping != null && clientShipping !== quoteShipping) {
    return {
      ok: false,
      code: "DELIVERY_FEE_CHANGED",
      message:
        "El costo de envío cambió. Revisa la cotización actualizada antes de continuar.",
      quote: params.quote,
    };
  }

  if (clientTotal != null && clientTotal !== quoteTotal) {
    return {
      ok: false,
      code: "QUOTE_CHANGED",
      message:
        "El total del pedido cambió. Confirma la cotización actualizada para continuar.",
      quote: params.quote,
    };
  }

  return null;
}

export function calculateAuthoritativeOrderQuote(params: {
  items: QuoteRequestItem[];
  products: QuoteProductRecord[];
  address: QuoteAddressInput;
  zones: AuthoritativeShippingZone[];
  clientQuote?: ClientQuoteSnapshot;
}): QuoteResult {
  if (!params.items.length) {
    return {
      ok: false,
      code: "PRODUCT_NOT_FOUND",
      message: "Agrega al menos un producto antes de continuar.",
    };
  }

  const latitude = validateCoordinate(params.address.latitude, -90, 90);
  const longitude = validateCoordinate(params.address.longitude, -180, 180);
  if (Number.isNaN(latitude) || Number.isNaN(longitude)) {
    return {
      ok: false,
      code: "INVALID_ADDRESS_COORDINATES",
      message: "Las coordenadas de la dirección no son válidas.",
    };
  }

  const productById = new Map(
    params.products.map((product) => [product.id, product]),
  );
  const seenProductIds = new Set<number>();
  const items: AuthoritativeOrderQuote["items"] = [];
  const businessIds = new Set<number>();

  for (const item of params.items) {
    if (
      !Number.isInteger(item.productId) ||
      item.productId <= 0 ||
      !Number.isInteger(item.quantity) ||
      item.quantity <= 0
    ) {
      return {
        ok: false,
        code: "INVALID_PRODUCT_QUANTITY",
        message: "Hay productos con cantidades inválidas en el pedido.",
      };
    }

    if (seenProductIds.has(item.productId)) {
      return {
        ok: false,
        code: "DUPLICATE_PRODUCT",
        message:
          "El pedido contiene productos duplicados. Revisa el carrito e intenta de nuevo.",
      };
    }
    seenProductIds.add(item.productId);

    const product = productById.get(item.productId);
    if (!product) {
      return {
        ok: false,
        code: "PRODUCT_NOT_FOUND",
        message: "Uno o más productos ya no existen.",
      };
    }

    if (Number(product.statusId ?? 0) !== 1) {
      return {
        ok: false,
        code: "PRODUCT_INACTIVE",
        message: `El producto ${product.name} ya no está disponible.`,
      };
    }

    if (!product.isStockAvailable || product.stockAverage < item.quantity) {
      return {
        ok: false,
        code: "PRODUCT_OUT_OF_STOCK",
        message: `El producto ${product.name} no tiene stock suficiente.`,
      };
    }

    const minPerOrder = Number(product.minPerOrder ?? 1);
    if (
      Number.isFinite(minPerOrder) &&
      minPerOrder > 1 &&
      item.quantity < minPerOrder
    ) {
      return {
        ok: false,
        code: "INVALID_PRODUCT_QUANTITY",
        message: `La cantidad de ${product.name} es menor al mínimo permitido.`,
      };
    }

    const maxPerOrder = Number(product.maxPerOrder ?? 0);
    if (
      Number.isFinite(maxPerOrder) &&
      maxPerOrder > 0 &&
      item.quantity > maxPerOrder
    ) {
      return {
        ok: false,
        code: "INVALID_PRODUCT_QUANTITY",
        message: `La cantidad de ${product.name} excede el máximo permitido.`,
      };
    }

    const unitPrice = roundMoney(
      Number(product.discountPrice ?? product.price ?? 0),
    );
    if (!Number.isFinite(unitPrice) || unitPrice <= 0) {
      return {
        ok: false,
        code: "PRICE_CHANGED",
        message: `El precio vigente de ${product.name} ya no es válido.`,
      };
    }

    const subtotal = roundMoney(unitPrice * item.quantity);
    businessIds.add(product.businessId);
    items.push({
      productId: product.id,
      productName: product.name,
      quantity: item.quantity,
      unitPrice,
      subtotal,
    });
  }

  if (businessIds.size !== 1) {
    return {
      ok: false,
      code: "MULTI_BUSINESS_NOT_ALLOWED",
      message:
        "Todos los productos del pedido deben pertenecer al mismo negocio.",
    };
  }

  const shipping = resolveAuthoritativeShippingQuote({
    address: params.address,
    zones: params.zones,
  });
  if (!shipping.ok) {
    return shipping;
  }

  const subtotal = roundMoney(
    items.reduce((total, item) => total + item.subtotal, 0),
  );
  const serviceFee = roundMoney(calculateServiceFee(subtotal));
  const breakdown = calculateOrderCommissionBreakdown({
    subtotal,
    deliveryFeeOverride: shipping.shippingCost,
    terminalFee: 0,
    tipAmount: 0,
    discountAmount: 0,
  });

  const quote: AuthoritativeOrderQuote = {
    businessId: Array.from(businessIds)[0] ?? 0,
    zoneName: shipping.zoneName,
    distanceKm: shipping.distanceKm,
    items,
    subtotal,
    serviceFee,
    deliveryFee: breakdown.deliveryFee,
    platformFee: breakdown.platformFee,
    driverFee: breakdown.driverFee,
    terminalFee: 0,
    tipAmount: 0,
    discountAmount: 0,
    total: breakdown.total,
  };

  const mismatch = params.clientQuote
    ? buildClientQuoteMismatch({
        clientQuote: params.clientQuote,
        quote,
      })
    : null;
  if (mismatch) {
    return mismatch;
  }

  return { ok: true, quote };
}

export function buildAddressMeta(input: {
  references: string;
  deliveryInstructions: string;
  zone: string;
}) {
  return JSON.stringify({
    references: input.references,
    deliveryInstructions: input.deliveryInstructions,
    deliveryNotes: input.deliveryInstructions,
    zone: input.zone,
    city: MAZAMITLA_CITY,
    state: MAZAMITLA_STATE,
  }).slice(0, 255);
}
