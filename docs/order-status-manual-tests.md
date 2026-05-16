# Order Status Manual Tests

1. Intentar `PENDING_PAYMENT -> DELIVERED` desde `/api/orders/[id]/status`.
   Resultado esperado: `409` con mensaje de que no se pueden brincar pasos.

2. Negocio intenta `PENDING_PAYMENT -> ACCEPTED_BY_BUSINESS`.
   Resultado esperado: `409` con mensaje de que el pedido debe estar pagado antes de ser aceptado.

3. Repartidor intenta marcar `DELIVERED` si el pedido no está recogido.
   Resultado esperado: `409` con mensaje de que no puede entregar un pedido que aún no fue recogido.

4. Repartidor intenta modificar un pedido asignado a otro repartidor.
   Resultado esperado: `403` con mensaje de que el repartidor no está asignado a ese pedido.

5. Cliente intenta marcar un pedido como `PAID`.
   Resultado esperado: `403` con mensaje de que el cliente no puede cambiar estados internos.

6. `ADMIN_GENERAL` valida transferencia y mueve `PAYMENT_REVIEW -> PAID`.
   Resultado esperado: `200`, historial registrado y negocio notificado.

7. Negocio mueve `PAID -> ACCEPTED_BY_BUSINESS -> PREPARING -> READY_FOR_PICKUP`.
   Resultado esperado: `200` en cada transición, sin saltos permitidos.

8. Repartidor asignado mueve `READY_FOR_PICKUP -> ASSIGNED_TO_DRIVER -> PICKED_UP -> DELIVERED`.
   Resultado esperado: `200` en cada transición si el pedido está asignado al repartidor correcto.

9. Pedido `CANCELLED` intenta volver a un estado activo.
   Resultado esperado: `409` con mensaje de que un pedido cancelado no puede reactivarse.

10. Pedido `DELIVERED` intenta volver a un estado anterior.
    Resultado esperado: `409` con mensaje de que un pedido entregado no puede modificarse.
