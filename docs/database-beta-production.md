# Database Beta/Production Guide

## Current diagnosis

- The real business table is `business`, not `businesses`.
- Auth and session hardening now rely on `mysql2` plus runtime-safe schema checks.
- Critical catalogs that must exist for stable operation:
  - `roles`
  - `status_catalog`
  - `order_status_catalog`
  - `delivery_status_catalog`
  - `payment_methods`
  - `vehicle_types`
- Critical auth/runtime tables now expected:
  - `user_sessions`
  - `password_reset_tokens`
  - `auth_rate_limits`
  - `auth_audit_logs`
  - `audit_logs`

## Recommended flow

### Development

1. Validate connection:
   - `npm run db:check`
   - `npm run db:doctor`
2. Generate Prisma client:
   - `npx prisma generate`
3. Apply safe migrations:
   - `npx prisma migrate deploy`
4. Load/repair base data:
   - `npm run seed`

### Production / Vercel / Aiven

1. Confirm target DB and SSL:
   - `npm run db:doctor`
2. Backup before any structural change.
3. Apply migrations with:
   - `npx prisma migrate deploy`
4. Run idempotent seed:
   - `npm run seed`

Do not use `prisma db push` directly in production.

## Backup strategy for Aiven/MySQL

### Before migrations

- Create an Aiven backup or snapshot from the console.
- Export critical tables if needed:
  - `users`
  - `roles`
  - `user_roles`
  - `business`
  - `products`
  - `orders`
  - `payments`
  - `user_sessions`
  - `audit_logs`

### Suggested export

Use a safe local export before risky changes:

```bash
mysqldump \
  --host="$DB_HOST" \
  --port="$DB_PORT" \
  --user="$DB_USER" \
  --password \
  --single-transaction \
  --set-gtid-purged=OFF \
  "$DB_NAME" users roles user_roles business products orders payments > backup-critical.sql
```

### Restore

```bash
mysql \
  --host="$DB_HOST" \
  --port="$DB_PORT" \
  --user="$DB_USER" \
  --password \
  "$DB_NAME" < backup-critical.sql
```

## Base data required

The seed must be idempotent and can be re-run safely.

### Roles

- `admin_general`
- `cliente`
- `negocio`
- `vendedor`
- `repartidor`
- `business_admin`
- `business_staff`

### Status catalog

- `active`
- `inactive`
- `pending`

### Order status catalog

- `pending_payment`
- `pending`
- `paid`
- `confirmed`
- `accepted`
- `preparing`
- `ready_for_pickup`
- `delivery_requested`
- `driver_assigned`
- `on_the_way`
- `delivered`
- `cancelled`
- `payment_failed`

### Payment methods

- `cash`
- `card`
- `transfer`
- `mercadopago`

## Manual verification checklist

1. Registro de usuario nuevo.
2. Envío y verificación de código de correo.
3. Login correcto.
4. Login incorrecto con bloqueo temporal.
5. Logout real y cookie invalidada.
6. Recuperación de contraseña por link.
7. Token expirado y token reutilizado.
8. Creación de negocio.
9. Asignación de dueño.
10. Creación de producto.
11. Flujo de pedido completo.
12. Validación admin de transferencia.
13. Cambio de estados sin brincar pasos.
14. Asignación de repartidor.
15. Entrega final.
16. Intentos prohibidos por cliente/negocio/repartidor.

## Risks still worth reviewing before July

- Some legacy API routes still verify JWT directly instead of requiring active `user_sessions`.
- There are mixed sources of truth between Prisma models and handwritten SQL in older modules.
- Existing production data should be checked for:
  - orphaned `user_roles`
  - orphaned `business_owners`
  - orders with invalid `order_status_id`
  - payments without matching methods
  - users with verified emails but temporary placeholder passwords
