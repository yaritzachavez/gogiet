# Delivery QA Checklist - Gogi Eats

Guía de prueba crítica para validar operación real del módulo Delivery antes de lanzar.

## Preparación

- Iniciar local con `npm run dev`.
- Usar la misma base configurada en `.env.local`.
- Tener 1 usuario negocio/vendedor con acceso al negocio.
- Tener 2 usuarios repartidores reales con rol `repartidor`.
- Verificar que los 2 repartidores tengan cuenta activa y correo verificado.
- Abrir 3 sesiones separadas: negocio/vendedor, repartidor A, repartidor B.

## SQL de verificación segura

Usar solo consultas `SELECT` para revisar estado:

```sql
SELECT id, email, is_available, driver_status, driver_active_since
FROM users
WHERE id IN (<driver_a_id>, <driver_b_id>);

SELECT d.id, d.order_id, d.driver_user_id, d.assigned_at, d.delivered_at,
       dsc.name AS delivery_status, osc.name AS order_status
FROM delivery d
LEFT JOIN delivery_status_catalog dsc ON dsc.id = d.delivery_status_id
LEFT JOIN orders o ON o.id = d.order_id
LEFT JOIN order_status_catalog osc ON osc.id = o.order_status_id
WHERE d.order_id = <order_id>;

SELECT *
FROM delivery_assignment_carousel_state
WHERE id = 1;

SELECT order_id, driver_user_id, status, created_at, updated_at
FROM delivery_assignment_attempts
WHERE order_id = <order_id>
ORDER BY id ASC;
```

## SQL para confirmar un pedido asignado real

Caso ejemplo pedido `#22`:

```sql
SELECT
  o.id AS order_id,
  o.driver_id AS order_driver_id,
  d.id AS delivery_id,
  d.driver_user_id AS delivery_driver_user_id,
  osc.name AS order_status,
  dsc.name AS delivery_status,
  dsc.is_final AS delivery_status_is_final,
  o.delivered_at AS order_delivered_at,
  d.delivered_at AS delivery_delivered_at
FROM orders o
LEFT JOIN delivery d ON d.order_id = o.id
LEFT JOIN order_status_catalog osc ON osc.id = o.order_status_id
LEFT JOIN delivery_status_catalog dsc ON dsc.id = d.delivery_status_id
WHERE o.id = 22;

SELECT
  u.id,
  u.email,
  u.first_name,
  u.last_name,
  u.is_available,
  u.driver_status,
  u.status_id,
  GROUP_CONCAT(r.name) AS roles
FROM users u
LEFT JOIN user_roles ur ON ur.user_id = u.id
LEFT JOIN roles r ON r.id = ur.role_id
WHERE u.id = <delivery_driver_user_id>
GROUP BY
  u.id,
  u.email,
  u.first_name,
  u.last_name,
  u.is_available,
  u.driver_status,
  u.status_id;
```

El pedido debe aparecer en `/delivery` si:

- `delivery_driver_user_id` u `order_driver_id` coincide con el usuario logueado.
- `delivery_status_is_final = 0`.
- `order_delivered_at IS NULL`.
- `delivery_delivered_at IS NULL`.
- `order_status` no es `delivered/cancelled/rejected/completed`.
- `delivery_status` no es `delivered/cancelled/rejected/completed`.

## Flujo 1: activar repartidores

1. Entrar como repartidor A en `/delivery`.
2. Cambiar estado a `Activo`.
3. Entrar como repartidor B en `/delivery`.
4. Cambiar estado a `Activo`.
5. Confirmar por SQL que ambos tienen `driver_status = 'ACTIVE'`, `is_available = 1` y `driver_active_since` no nulo.

Debe pasar:

- Panel Delivery muestra estado `Activo`.
- Panel Admin > Repartos muestra el mismo estado.
- El orden del carrusel respeta `driver_active_since ASC, id ASC`.
- El carrusel usa `users.driver_status` como fuente principal del estado operativo.
- `delivery_profiles` o `driver_profiles` no deben contradecir el estado operativo del usuario.

No debe pasar:

- Admin muestra `En descanso` mientras Delivery muestra `Activo`.
- Un repartidor suspendido, desactivado u offline entra al carrusel.
- `is_available = 1` no debe meter al carrusel a un usuario con `driver_status = RESTING/OFFLINE/SUSPENDED/DISABLED`.

## Flujo 2: vendedor solicita repartidor

1. Crear o usar un pedido real del negocio.
2. Marcarlo como listo para recoger.
3. Desde negocio/vendedor presionar `Solicitar repartidor`.

Endpoints involucrados:

- `POST /api/business/orders/:id/request-delivery`
- `POST /api/business/orders/request-delivery`
- `GET /api/delivery/orders`
- `GET /api/delivery/dashboard`

Debe pasar:

- Se crea/actualiza una fila en `delivery`.
- Solo el repartidor que toca por carrusel ve la oferta.
- El otro repartidor no ve la oferta.
- `delivery_assignment_attempts` registra `OFFERED`.
- `delivery_assignment_carousel_state.last_driver_user_id` queda en el repartidor ofertado.

No debe pasar:

- La oferta aparece a todos.
- El carrusel siempre inicia en el primer repartidor.
- Se crea más de una entrega activa para el mismo pedido.

## Flujo 3: rechazo y reasignación

1. En el repartidor que recibió la oferta, presionar `Rechazar`.
2. Revisar el panel del siguiente repartidor.

Endpoint involucrado:

- `PATCH /api/delivery/assignments/:orderId` con `{ "action": "reject" }`

Debe pasar:

- El primer repartidor deja de ver la oferta.
- `delivery_assignment_attempts` registra `REJECTED`.
- El siguiente repartidor del carrusel recibe la oferta.
- `delivery.driver_user_id` cambia al siguiente repartidor.

No debe pasar:

- El pedido se queda brincando entre ambos.
- El primer repartidor vuelve a recibir el mismo pedido.
- El pedido queda visible como disponible para todos.

## Flujo 4: aceptación

1. En el repartidor que recibió la nueva oferta, presionar `Aceptar entrega`.
2. Refrescar panel Delivery y Admin.

Endpoint involucrado:

- `PATCH /api/delivery/assignments/:orderId` con `{ "action": "accept" }`

Debe pasar:

- `delivery_status` cambia a `aceptado`.
- `orders.driver_id` queda con el id del repartidor.
- El pedido aparece en `Entregas actuales` solo para ese repartidor.
- `delivery_assignment_attempts` registra `ACCEPTED`.
- El siguiente pedido inicia con el repartidor posterior al que aceptó.

No debe pasar:

- Dos repartidores aceptan el mismo pedido.
- Un repartidor offline/descanso/suspendido acepta.
- El pedido aparece en entregas actuales de otro repartidor.

## Flujo 5: botones operativos

Probar en la card de entrega actual:

- `Ver ruta`: abre Google Maps con dirección o coordenadas.
- `Llamar`: abre `tel:` con teléfono del cliente.
- `En camino al negocio`: cambia estado de delivery a `en_camino_negocio`.
- `Llegué al negocio`: cambia estado de delivery a `llegue_al_negocio`.
- `Pedido recogido`: cambia pedido a `on_the_way` y delivery a `recogido`.
- `Incidencia`: registra estado `incidencia`.
- `Ver resumen`: abre el resumen sin desmontar la tarjeta.

Debe pasar:

- Cada acción muestra loading.
- Si falla, aparece toast/error claro.
- La tarjeta no parpadea ni desaparece durante refetch.

No debe pasar:

- Botones con texto invisible.
- Scroll automático raro.
- Estados falsos o duplicados.

## Flujo 6: marcar Entregado

1. Con el pedido asignado al repartidor correcto, presionar `Entregado`.
2. Confirmar en el modal.

Endpoint involucrado:

- `PATCH /api/delivery/orders/:orderId/status` con `{ "status": "delivered" }`

Debe pasar:

- `orders` cambia a estado canónico `delivered`.
- `orders.delivered_at` se llena.
- `delivery.delivered_at` se llena.
- `delivery_status` cambia a `completado`.
- Se guarda ganancia en `driver_earnings` si la tabla existe.
- El pedido desaparece inmediatamente de `Entregas actuales`.
- El contador baja.
- Admin y negocio ven el pedido entregado.
- El repartidor libera cupo para otro pedido.

No debe pasar:

- El pedido queda en `PENDIENTE`.
- El pedido sigue visible como activo.
- El endpoint responde `success: true` sin cambiar base de datos.
- Doble click crea doble entrega o doble ganancia.

## Flujo 7: carrusel con 2+ pedidos

1. Activar repartidores en orden A y luego B.
2. Solicitar pedido 1: debe iniciar en A.
3. Si A acepta, solicitar pedido 2: debe iniciar en B.
4. Si B rechaza pedido 2, debe pasar a A.
5. Si A acepta pedido 2, solicitar pedido 3: debe iniciar en B.

Debe pasar:

- El puntero persiste en `delivery_assignment_carousel_state`.
- El carrusel no se reinicia al primer repartidor.
- Los rechazados se saltan para el mismo pedido.

## Flujo 8: límites y estados no operativos

1. Poner repartidor A en `En descanso`.
2. Solicitar pedido nuevo.
3. Suspender repartidor B desde Admin.
4. Solicitar pedido nuevo.

Debe pasar:

- A no recibe pedidos en descanso.
- B no recibe pedidos suspendido.
- Si no hay repartidores activos, negocio recibe mensaje de sin repartidor disponible.
- Admin recibe notificación si aplica.

No debe pasar:

- Un repartidor suspendido acepta/rechaza/entrega.
- Un repartidor con 5 entregas activas recibe más ofertas.

## Errores comunes a revisar

- `No autorizado para acceder al panel de repartidor`: el usuario no tiene rol `repartidor`.
- `Tu estado operativo no permite...`: el repartidor está offline, descanso, suspendido o desactivado.
- `Esta entrega ya fue tomada por otro repartidor`: doble aceptación bloqueada correctamente.
- `La entrega ya fue completada`: doble entrega bloqueada correctamente.
- `El pedido debe estar listo antes de solicitar repartidor`: el pedido no está en `ready_for_pickup/listo_para_recoger`.
- Si Aiven/MySQL falla, el usuario debe ver un mensaje amigable; el detalle técnico solo debe aparecer en logs del servidor.
- Si aparece `ENOTFOUND`, validar `DATABASE_URL` en Vercel contra el host actual de Aiven y redeploy.

## Validación de conexión y errores seguros

1. Confirmar que solo existe un `new PrismaClient`:

```bash
rg -n "new PrismaClient|\\.\\$disconnect\\(" src prisma scripts
```

Debe pasar:

- Solo aparece `src/lib/prisma.ts`.
- No hay `prisma.$disconnect()` dentro de requests.
- `DATABASE_URL` conserva SSL y usa `connection_limit`/`pool_timeout`.

2. Simular falla de base o revisar logs cuando Aiven no responde.

Debe pasar:

- Home, tiendas, productos, negocio y delivery no muestran host, SQL, stack ni errores Prisma.
- APIs regresan `success: false` con mensaje amigable.
- El error real queda en `console.error`/logs de Vercel.

## Validación técnica local

Ejecutar:

```bash
npx biome check src/lib/delivery-assignments.ts src/lib/business-panel.ts src/lib/api-error.ts src/app/api/delivery/orders/[orderId]/status/route.ts src/components/delivery/current-deliveries-card.tsx
npx tsc --noEmit
npx prisma validate
npx prisma generate
npm run build
```

Nota: `npm run lint` puede reportar deuda previa fuera de Delivery; revisar únicamente errores nuevos en archivos modificados.
