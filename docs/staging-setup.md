# Isolated Staging Setup

This document defines how to prepare a fully isolated staging environment for Gogi Eats without touching `gogi_prod`.

## Current repo audit

- `vercel.json` is not present in this repository.
- `.env.example` now documents the minimum safe variable set.
- Local runtime can still point to `gogi_prod`, so staging must be verified before any write operation.
- Preview protection may require a temporary Vercel automation bypass; do not disable global protection.

## Requirements

1. A dedicated MySQL database named `gogi_staging`.
2. A dedicated staging DB user with least privilege.
3. TLS enabled for the staging connection.
4. Preview-only environment variables in Vercel.
5. Test-only Mercado Pago credentials.
6. A pre-migration backup or snapshot.
7. QA-only seed data under `@gogieats.test`.
8. Read-only verification evidence before any write or migration.

## Recommended staging topology

- Service: isolated MySQL service or isolated database within a separate staging service.
- Database name: `gogi_staging`
- User: dedicated staging-only user
- Network: restrict inbound access to the team and CI runners that need it
- TLS: required
- Preview app URL: a Vercel Preview URL or dedicated staging domain
- Payment provider: test-only credentials and webhook endpoint

## Environment matrix

| Variable | Development | Preview | Staging | Production | Public/Private | Required | Consumer | Risk if misconfigured |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `APP_ENV` | `development` | `staging` or `preview` | `staging` | `production` | Private | Yes | server logger, guards, staging verifier | Wrong runtime classification can disable protections or hide contradictions |
| `DATABASE_ENV` | `development` | `staging` | `staging` | `production` | Private | Yes | `db-write-guard`, staging verifier | Writes may target the wrong database tier |
| `DATABASE_URL` | local dev DB | preview DB URL | staging DB URL | prod DB URL | Private | Yes | Prisma, mysql2 helpers, guards | Direct writes or reads against the wrong database |
| `DIRECT_URL` | optional local admin URL | optional preview direct URL | optional staging direct URL | optional prod direct URL | Private | No | tooling / future Prisma direct access | Admin tooling may hit the wrong target |
| `DB_HOST` | local host | staging host | staging host | production host | Private | Conditional | mysql2 scripts, DB diagnostics | Host mismatch can hide unsafe routing |
| `DB_PORT` | local port | staging port | staging port | prod port | Private | Conditional | mysql2 scripts, DB diagnostics | Connection failures or hidden mismatches |
| `DB_NAME` | `gogi_dev` | `gogi_staging` | `gogi_staging` | `gogi_prod` | Private | Conditional | DB diagnostics, guards, mysql2 | Hidden production targeting |
| `DB_USER` | dev user | staging user | staging user | prod user | Private | Conditional | DB diagnostics, mysql2 | Shared credentials reduce blast-radius isolation |
| `DB_PASSWORD` | dev password | staging password | staging password | prod password | Private | Conditional | mysql2 runtime, scripts | Login failures or accidental cross-environment reuse |
| `DB_PASS` | optional alias | optional alias | optional alias | optional alias | Private | No | legacy scripts | Drift between aliases can hide wrong credentials |
| `DB_SSL_CA` | optional | required if staging CA inline | required if staging CA inline | required if prod CA inline | Private | Conditional | DB SSL helpers | Broken TLS or unsafe fallback |
| `DB_CA` | optional legacy alias | optional | optional | optional | Private | No | DB SSL helpers | Same as above |
| `DB_REQUIRE_SSL` | `false` locally unless needed | `true` when staging requires TLS | `true` | `true` | Private | Conditional | DB runtime / Prisma runtime | Plain-text DB traffic or failed connections |
| `DB_POOL_CONNECTION_LIMIT` | low local value | low preview value | low staging value | low prod value | Private | No | mysql2 pool, Prisma pool fallback | Connection pressure or starvation |
| `DB_POOL_QUEUE_LIMIT` | small queue | small queue | small queue | tuned queue | Private | No | mysql2 pool | Queue explosions under load |
| `PRISMA_CONNECTION_LIMIT` | local small value | preview small value | staging small value | tuned prod value | Private | No | Prisma runtime | Too many DB connections |
| `PRISMA_POOL_TIMEOUT` | short local timeout | short preview timeout | short staging timeout | tuned prod timeout | Private | No | Prisma runtime | Hanging DB waits |
| `PRODUCTION_DB_NAME` | `gogi_prod` reference | `gogi_prod` reference | `gogi_prod` reference | `gogi_prod` | Private metadata | Yes for staging safety | staging guard / verifier | Cannot prove DB separation |
| `PRODUCTION_DB_HOST_FINGERPRINT` | optional | required for safe Preview writes | required for safe staging writes | optional | Private metadata | Yes for staging writes | staging guard / verifier | Host equality with production becomes unverifiable |
| `PRODUCTION_DB_USER_FINGERPRINT` | optional | recommended | recommended | optional | Private metadata | No | staging guard / verifier | Shared DB user may go unnoticed |
| `NEXT_PUBLIC_APP_URL` | local app URL | preview URL | staging URL | `https://www.gogieats.shop` | Public | Yes | frontend links, Mercado Pago callback base, auth flows | Wrong callbacks, wrong links, mixed environment traffic |
| `APP_URL` | local app URL | preview URL | staging URL | production URL | Private | Recommended | forgot-password, staging verifier | Back-office callbacks or emails may point at production |
| `NEXTAUTH_URL` | reserved local URL | reserved preview URL | reserved staging URL | reserved prod URL | Public-ish | No | reserved compatibility | Future auth integration could route users incorrectly |
| `JWT_SECRET` | local secret | preview secret | staging secret | prod secret | Private | Yes | auth routes, layouts, token validation | Broken login or cross-environment session reuse |
| `NEXTAUTH_SECRET` | local secret | preview secret | staging secret | prod secret | Private | Optional now | env validation | Weak auth secret handling |
| `AUTH_SECRET` | reserved | reserved | reserved | reserved | Private | No | documented compatibility placeholder | Future auth code may default unsafely |
| `SESSION_SECRET` | local secret | preview secret | staging secret | prod secret | Private | Optional now | env validation | Session invalidation or cross-env cookie trust |
| `ADMIN_SECRET` | local secret | preview secret | staging secret | prod secret | Private | Optional now | env validation | Sensitive admin operations can drift |
| `AUTH_COOKIE_DOMAIN` | `localhost` | preview host | staging host | production domain | Private | No | auth cookies | Cookies may leak across domains |
| `AUTH_SESSION_HOURS` | shorter local | preview/test suitable | staging suitable | production suitable | Private | No | auth/session config | Sessions live too long or expire too early |
| `JWT_EXPIRES_IN` | local duration | preview duration | staging duration | production duration | Private | No | login route | Mismatched token expirations |
| `JWT_EXPIRATION` | legacy alias | legacy alias | legacy alias | legacy alias | Private | No | login route fallback | Ambiguous expiration source |
| `NEXT_PUBLIC_MERCADOPAGO_PUBLIC_KEY` | optional local test key | test key only | test key only | production public key | Public | Required for checkout | `src/app/carrito/page.tsx` | Preview checkout can accidentally use production account |
| `MERCADOPAGO_ACCESS_TOKEN` | optional local test token | test token only | test token only | production token | Private | Required for MP backend | `src/lib/mercadopago.ts` | Real payments or real webhooks from Preview |
| `MERCADOPAGO_WEBHOOK_SECRET` | optional local test secret | test webhook secret | test webhook secret | production webhook secret | Private | Required in prod, recommended elsewhere | webhook signature validation | False positives / false negatives in webhook auth |
| `NEXT_PUBLIC_MERCADOPAGO_DEBUG` | `0` or `1` locally | `1` while debugging Preview | `1` only while debugging staging | `0` | Public | No | checkout UI debug logs | Debug noise or accidental sensitive telemetry |
| `NEXT_PUBLIC_TRANSFER_BANK` | fake/local | fake/preview | fake/staging | real business-facing | Public | Conditional | checkout transfer instructions | Users see the wrong transfer destination |
| `NEXT_PUBLIC_TRANSFER_HOLDER` | fake/local | fake/preview | fake/staging | production holder | Public | Conditional | checkout transfer instructions | Misleading bank holder data |
| `NEXT_PUBLIC_TRANSFER_CLABE` | fake/local | fake/preview | fake/staging | production CLABE | Public | Conditional | checkout transfer instructions | Money can be routed incorrectly |
| `NEXT_PUBLIC_TRANSFER_ACCOUNT_NUMBER` | fake/local | fake/preview | fake/staging | production account | Public | Conditional | checkout transfer instructions | Same as above |
| `RESEND_API_KEY` | optional dev key | preview/test key | staging/test key | production key | Private | Conditional | verification + reset emails | Preview emails can hit real sender reputation |
| `EMAIL_FROM` | local/test sender | preview sender | staging sender | production sender | Public-ish | Conditional | email helpers | Customers receive confusing or broken messages |
| `EMAIL_VERIFICATION_ENABLED` | usually `true` | configurable | configurable | `true` | Private | No | email helpers | Tests may silently skip verification |
| `SMTP_HOST` | fake/local | preview SMTP | staging SMTP | production SMTP | Private | Optional fallback | not actively used everywhere | Mail can leak to the wrong infra |
| `SMTP_USER` | fake/local | preview SMTP user | staging SMTP user | production SMTP user | Private | Optional fallback | future SMTP consumers | Same |
| `SMTP_PASS` | fake/local | preview SMTP pass | staging SMTP pass | production SMTP pass | Private | Optional fallback | future SMTP consumers | Same |
| `CLOUDINARY_CLOUD_NAME` | dev cloud or demo | staging cloud | staging cloud | production cloud | Private | Conditional | uploads/media | Assets land in the wrong cloud |
| `CLOUDINARY_API_KEY` | dev key | staging key | staging key | production key | Private | Conditional | uploads/media | Media account isolation breaks |
| `CLOUDINARY_API_SECRET` | dev secret | staging secret | staging secret | production secret | Private | Conditional | uploads/media | Asset compromise risk |
| `STORAGE_BUCKET_NAME` | reserved local bucket | reserved preview bucket | reserved staging bucket | reserved prod bucket | Private | No currently | reserved storage integration | Future file writes can cross environments |
| `AWS_ACCESS_KEY_ID` | reserved fake | reserved preview | reserved staging | reserved prod | Private | No currently | reserved storage integration | Same |
| `AWS_SECRET_ACCESS_KEY` | reserved fake | reserved preview | reserved staging | reserved prod | Private | No currently | reserved storage integration | Same |
| `NEXT_PUBLIC_MAPS_API_KEY` | reserved fake | reserved preview | reserved staging | reserved prod | Public | No currently | reserved maps integration | Frontend can leak a production billing key |
| `SENTRY_DSN` | optional dev DSN | preview DSN | staging DSN | production DSN | Private-ish | No currently | reserved monitoring | Cross-environment telemetry pollution |
| `PASSWORD_PEPPER` | local pepper | preview pepper | staging pepper | production pepper | Private | Yes when password flows run | auth password hashing | Password hashes become incompatible |
| `PASSWORD_RESET_TOKEN_MINUTES` | shorter local | preview/test value | staging value | production value | Private | No | password reset flow | Expired or overly long reset windows |
| `SALT_ROUNDS` | lower for tests | preview/staging chosen value | staging value | production value | Private | No | bcrypt hashing | CPU usage or security drift |
| `ENABLE_INTERNAL_TOOLS` | usually `false` | `false` | `false` | `false` | Private | No | internal-tools gate | Hidden tools accidentally exposed |
| `ALLOW_STAGING_DB_WRITES` | `false` unless intentionally writing to non-prod | `false` by default | `false` by default | `false` | Private | Required only for guarded writes | staging guard | A bad flag with the wrong DB can become destructive |
| `SEED_DEMO_DATA` | optional local | usually `false` | usually `false` | `false` | Private | No | `prisma/seed.js` | Unexpected demo content in real environments |

## Callback and webhook URLs

These URLs should always derive from the non-production app URL in Preview / staging:

- Password reset links
- Email verification links
- Mercado Pago `notification_url`
- Mercado Pago return/callback routes
- Any webhook receiver used for QA

For Preview and staging:

- Never point callbacks at `https://www.gogieats.shop`
- Never point test webhooks at production
- Never reuse production webhook secrets

## Staging creation procedure

1. Create or select an isolated MySQL service.
2. Create database `gogi_staging`.
3. Create a staging-only user with minimum privileges.
4. Enable TLS.
5. Generate a snapshot or backup before migrations.
6. Configure Preview-only variables in Vercel.
7. Run the read-only environment verifier.
8. Only after a PASS result, allow guarded writes and migrations.

## Verification of isolation

Before any write:

1. `SELECT DATABASE()` must return `gogi_staging`
2. Host fingerprint must not match production
3. User fingerprint must not match production when reference exists
4. Preview URL must not be production
5. Mercado Pago credentials must be test-only or explicitly marked unverified
6. Guard must still block when any contradiction is introduced

## Seed QA policy

Preferred strategy for Gogi Eats:

- Empty or migration-only schema
- Controlled QA seed
- No copy of production PII

QA records must use:

- `qa.*@gogieats.test`
- fake phone numbers
- fake addresses
- QA-prefixed names
- trackable SKUs and shipping zones

## Vercel Preview checklist

Configure Preview only:

- `APP_ENV=staging`
- `DATABASE_ENV=staging`
- `DATABASE_URL` for `gogi_staging`
- `NEXT_PUBLIC_APP_URL` for the Preview URL
- test Mercado Pago credentials
- staging-only webhook secret
- staging-only email/media credentials when applicable

Do not bulk-copy Production variables into Preview.

## Validation checklist

1. Guard tests pass
2. Staging verifier returns `STAGING ENVIRONMENT VERIFIED`
3. Preview URL is reachable through the approved access path
4. No production database identifiers appear in staging config
5. No production payment credentials appear in Preview
6. Snapshot/backup exists before migrations
7. QA seed remains dry-run only until staging is verified

## Cleanup and destruction

- Remove QA data with the guarded cleanup script
- Revoke the temporary Preview bypass token after QA
- Rotate any leaked or accidentally reused staging credentials
- Remove the staging database only after confirming backup retention
