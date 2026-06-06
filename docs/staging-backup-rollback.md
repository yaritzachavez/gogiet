# Staging Backup and Rollback Procedures

This document describes how to protect and recover the isolated staging environment for Gogi Eats. It must never be used to operate directly on production.

## Scope

- Environment: Preview / staging only
- Database target: `gogi_staging`
- App target: staging Preview deployment only
- Payment provider: test-only credentials

## Rules

1. Never restore into `gogi_prod`.
2. Never reuse production credentials in staging rollback tasks.
3. Never consider a backup validated until it has been restored into a non-production target.
4. Never run destructive cleanup without the staging guard passing.

## Pre-change snapshot

Before any migration or QA write:

1. Create an Aiven snapshot or provider-native backup of the staging service.
2. Record:
   - timestamp
   - environment
   - DB name
   - masked host
   - operator
   - branch / commit SHA
3. Confirm the snapshot belongs to staging, not production.

## Optional SQL export

If a portable export is required, run it only against staging:

```bash
mysqldump \
  --host="$DB_HOST" \
  --port="$DB_PORT" \
  --user="$DB_USER" \
  --password \
  --single-transaction \
  --set-gtid-purged=OFF \
  "$DB_NAME" > gogi-staging-backup.sql
```

Recommended handling:

- encrypt the export at rest
- store it in a restricted location
- set a retention date
- document who can decrypt it

## Backup metadata checklist

Record at minimum:

- backup ID or snapshot ID
- staging DB name
- masked host fingerprint
- migration set being applied
- QA seed state
- whether rollback was tested

## Restore procedure

Restore only into a non-production target:

```bash
mysql \
  --host="$DB_HOST" \
  --port="$DB_PORT" \
  --user="$DB_USER" \
  --password \
  "$DB_NAME" < gogi-staging-backup.sql
```

After restore:

1. Run `SELECT DATABASE()` and confirm `gogi_staging`
2. Run the staging verifier script
3. Confirm QA data and environment variables match the expected branch
4. Re-run non-destructive validations

## Rollback of code

If a staging deploy must be rolled back:

1. identify the last known-good branch/commit SHA
2. redeploy Preview from that commit
3. keep staging variables isolated
4. do not copy production variables
5. re-run the staging verifier after redeploy

## Rollback of migrations

Before `prisma migrate deploy` in staging:

1. inspect pending migrations
2. review SQL for destructive changes
3. confirm a snapshot exists

If a rollback is needed:

1. restore the pre-migration snapshot into staging
2. redeploy the app code that matches the restored schema
3. rerun:
   - `npx prisma validate`
   - `npx prisma generate`
   - `npx tsc --noEmit`
   - `npm run build`

Do not use `prisma db push` as a rollback substitute.

## QA cleanup before or after rollback

Use the guarded cleanup script:

```bash
node scripts/cleanup-staging-qa.js --write --confirm=QA-STAGING
```

Only after:

- staging verifier PASS
- staging write guard PASS
- explicit operator confirmation

## Incident: accidental connection to production

If any staging action points to production:

1. stop immediately
2. do not retry with the same env
3. preserve sanitized evidence
4. rotate affected credentials
5. review Vercel variables and local env files
6. review audit logs and DB access history
7. document the incident before resuming work

## Credential rotation

Rotate the following if exposure or misuse is suspected:

- staging DB password
- staging DB user if needed
- Mercado Pago test credentials
- staging webhook secret
- email provider staging key
- media/storage staging secrets

## Retention

Recommended minimum staging retention policy:

- latest pre-migration snapshot
- latest known-good post-migration snapshot
- short-lived QA exports only when strictly needed

Destroy stale staging backups according to the team's retention rules.

## Safe destruction of staging

When staging is retired:

1. export any required QA evidence
2. clean QA records
3. revoke Preview bypass tokens
4. remove staging-only Vercel variables
5. rotate staging credentials if they were shared among operators
6. delete the staging DB/service only after backup retention is confirmed

## Human verification checklist

- Snapshot created before migrations
- Restore tested on a non-production target
- Preview points only to staging
- Staging verifier passes after restore
- No production credentials are present
- QA cleanup script remains dry-run by default
