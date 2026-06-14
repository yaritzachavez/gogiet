import assert from "node:assert/strict";
import test from "node:test";

import {
  buildAddressMeta,
  calculateAuthoritativeOrderQuote,
  resolveAuthoritativeShippingQuote,
} from "./order-quote.ts";

const zones = [
  { id: 1, nombre: "Centro", distanciaKm: 3.5, activo: true },
  { id: 2, nombre: "Lejana", distanciaKm: 0, activo: true },
];

const products = [
  {
    id: 10,
    name: "Pizza",
    businessId: 5,
    statusId: 1,
    isStockAvailable: true,
    stockAverage: 10,
    price: 120,
    discountPrice: 99.9,
    minPerOrder: 1,
    maxPerOrder: 5,
  },
  {
    id: 11,
    name: "Pasta",
    businessId: 5,
    statusId: 1,
    isStockAvailable: true,
    stockAverage: 8,
    price: 80.25,
    discountPrice: null,
    minPerOrder: 1,
    maxPerOrder: 5,
  },
  {
    id: 12,
    name: "Otro negocio",
    businessId: 6,
    statusId: 1,
    isStockAvailable: true,
    stockAverage: 3,
    price: 50,
    discountPrice: null,
  },
];

test("shipping quote resolves server-side zone and cost", () => {
  const result = resolveAuthoritativeShippingQuote({
    address: { neighborhood: "Centro" },
    zones,
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.zoneName, "Centro");
  assert.equal(result.distanceKm, 3.5);
  assert.equal(result.shippingCost, 53);
});

test("shipping quote rejects zero-distance zone instead of giving free shipping", () => {
  const result = resolveAuthoritativeShippingQuote({
    address: { neighborhood: "Lejana" },
    zones,
  });

  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.code, "INVALID_SHIPPING_CONFIGURATION");
});

test("quote uses server-side product prices and ignores lower client totals", () => {
  const result = calculateAuthoritativeOrderQuote({
    items: [{ productId: 10, quantity: 2 }],
    products,
    address: { neighborhood: "Centro" },
    zones,
    clientQuote: {
      subtotal: 20,
      shippingCost: 1,
      total: 21,
    },
  });

  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.code, "PRICE_CHANGED");
  assert.equal(result.quote?.items[0]?.unitPrice, 99.9);
});

test("quote recalculates using current product prices with cents", () => {
  const result = calculateAuthoritativeOrderQuote({
    items: [
      { productId: 10, quantity: 1 },
      { productId: 11, quantity: 1 },
    ],
    products,
    address: { neighborhood: "Centro" },
    zones,
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.quote.subtotal, 180.15);
  assert.equal(result.quote.serviceFee, 9.01);
  assert.equal(result.quote.deliveryFee, 53);
  assert.equal(result.quote.total, 242.16);
});

test("quote rejects manipulated shipping discrepancy", () => {
  const result = calculateAuthoritativeOrderQuote({
    items: [{ productId: 10, quantity: 1 }],
    products,
    address: { neighborhood: "Centro" },
    zones,
    clientQuote: {
      subtotal: 99.9,
      shippingCost: 0,
      total: 104.9,
    },
  });

  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.code, "DELIVERY_FEE_CHANGED");
});

test("quote rejects manipulated total discrepancy even when subtotal matches", () => {
  const result = calculateAuthoritativeOrderQuote({
    items: [{ productId: 10, quantity: 1 }],
    products,
    address: { neighborhood: "Centro" },
    zones,
    clientQuote: {
      subtotal: 99.9,
      shippingCost: 53,
      total: 120,
    },
  });

  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.code, "QUOTE_CHANGED");
});

test("quote rejects invalid coordinates", () => {
  const result = calculateAuthoritativeOrderQuote({
    items: [{ productId: 10, quantity: 1 }],
    products,
    address: { neighborhood: "Centro", latitude: 120, longitude: -103 },
    zones,
  });

  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.code, "INVALID_ADDRESS_COORDINATES");
});

test("quote rejects negative, zero and duplicate quantities", () => {
  const negative = calculateAuthoritativeOrderQuote({
    items: [{ productId: 10, quantity: 0 }],
    products,
    address: { neighborhood: "Centro" },
    zones,
  });
  assert.equal(negative.ok, false);
  if (!negative.ok) {
    assert.equal(negative.code, "INVALID_PRODUCT_QUANTITY");
  }

  const duplicate = calculateAuthoritativeOrderQuote({
    items: [
      { productId: 10, quantity: 1 },
      { productId: 10, quantity: 1 },
    ],
    products,
    address: { neighborhood: "Centro" },
    zones,
  });
  assert.equal(duplicate.ok, false);
  if (!duplicate.ok) {
    assert.equal(duplicate.code, "DUPLICATE_PRODUCT");
  }
});

test("quote rejects inactive, missing and cross-business products", () => {
  const missing = calculateAuthoritativeOrderQuote({
    items: [{ productId: 999, quantity: 1 }],
    products,
    address: { neighborhood: "Centro" },
    zones,
  });
  assert.equal(missing.ok, false);
  if (!missing.ok) {
    assert.equal(missing.code, "PRODUCT_NOT_FOUND");
  }

  const inactive = calculateAuthoritativeOrderQuote({
    items: [{ productId: 10, quantity: 1 }],
    products: [{ ...products[0], statusId: 2 }, ...products.slice(1)],
    address: { neighborhood: "Centro" },
    zones,
  });
  assert.equal(inactive.ok, false);
  if (!inactive.ok) {
    assert.equal(inactive.code, "PRODUCT_INACTIVE");
  }

  const multiBusiness = calculateAuthoritativeOrderQuote({
    items: [
      { productId: 10, quantity: 1 },
      { productId: 12, quantity: 1 },
    ],
    products,
    address: { neighborhood: "Centro" },
    zones,
  });
  assert.equal(multiBusiness.ok, false);
  if (!multiBusiness.ok) {
    assert.equal(multiBusiness.code, "MULTI_BUSINESS_NOT_ALLOWED");
  }
});

test("address meta no longer stores client distance", () => {
  const meta = JSON.parse(
    buildAddressMeta({
      references: "Puerta azul",
      deliveryInstructions: "Tocar dos veces",
      zone: "Centro",
    }),
  ) as Record<string, unknown>;

  assert.equal("estimatedDistanceKm" in meta, false);
  assert.equal(meta.zone, "Centro");
});
