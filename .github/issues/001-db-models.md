## What to build

Add Prisma models and migrations for the integration:
- `IntegrationConfig` (single-row): stores `ventrata_webhook_secret`, `zoho_refresh_token`, `access_token`, `expires_at`, and token metadata.
- `Webhook_Logs`: stores incoming webhook payload, status, attempts, last_error, dlq_ref, created_at, processed_at.
- `IdempotencyMap`: maps `ventrata_uuid` -> `zoho_record_id`, with timestamps.

## Acceptance criteria
- [ ] Prisma models added to `prisma/schema.prisma`.
- [ ] Migration present under `prisma/migrations/`.
- [ ] Basic CRUD helpers exist for admin UI and workers.

## Blocked by
None - can start immediately
