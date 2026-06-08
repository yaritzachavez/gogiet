# Route Canonicalization

## UI routes

- `/carrito`
  - Canonical customer cart route.
  - `/cart` remains a safe alias and should redirect to `/carrito`.
- `/pedidos`
  - Canonical customer order history list.
- `/pedidos/[orderId]`
  - Canonical customer order detail route.
- `/orders/[id]`
  - Legacy detail alias for direct order links.
  - Do not redirect `/pedidos` to `/orders/[id]`; they are not equivalent resources.

## Webhook routes

- `/api/payments/mercadopago/webhook`
  - Canonical Mercado Pago webhook route.
- `/api/webhooks/mercadopago`
  - Backward-compatible alias that currently re-exports the canonical handler.
  - Keep the alias until every external integration is confirmed against the canonical path.
