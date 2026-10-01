# Ventrata Booking and Contact Source Implementation Plan

## Goal

Complete the existing Ventrata-to-Zoho booking webhook path and add a durable, admin-started historical booking import. Both paths must produce the same Zoho Contact and Booking records and remain safe to replay.

## Decisions

- One reseller-facing OCTO supplier connection per deployment; keep `VENTRATA_API_KEY` deployment-managed.
- Contacts are available only through bookings. Match Contacts by email, then phone; email takes precedence if identifiers disagree.
- Ventrata overwrites mapped Zoho fields when it supplies a value. Missing or null source values preserve Zoho values.
- If a booking has no email or phone, sync it without `Contact_Id` and report the missing identity; do not create a name-only Contact.
- Use booking UUID as `Booking_Ref` and idempotency key. Process Confirmed, Cancelled, and Redeemed statuses.
- Map supplier net pricing to `Booking_Amount`, convert minor units using `currencyPrecision`, and populate the currency field. Map `allowMarketing` to a Zoho consent field, including explicit `false` values.
- Admins explicitly start bounded imports by travel-date range. Imports run in the background, track progress and failures, and continue after per-record errors.
- For the same booking, the record with the newer Ventrata update timestamp wins across import and webhook paths.
- The app registers the booking webhook using a generated, encrypted `X-Webhook-Secret` shared with ingress validation.

## Implementation Sequence

1. **Preflight external contracts**
   - Confirm the supplier API key has booking-list and webhook capabilities.
   - Verify exact webhook event names, payload shape, custom-header behavior, and API capability headers against the supplier test connection; align the wrapper with the current OCTO docs.
   - Confirm Zoho API names, field types, and write permissions for consent, amount, currency, and booking status fields.
   - Verify pricing values are in minor units and validate currency precision with representative test payloads.

2. **Secure Ventrata connection and webhook lifecycle**
   - Extend the singleton integration configuration to store a generated webhook secret encrypted at rest, reusing the credential encryption helper and configured encryption key.
   - Add idempotent webhook registration/status handling so repeated setup does not create duplicate subscriptions; include the secret in the registered webhook headers.
   - Keep the supplier API key out of the database and UI. Expose connection and webhook status without returning secrets.

3. **Unify booking normalization and Zoho upserts**
   - Use one source adapter/upsert path for both webhook and historic-booking inputs.
   - Normalize booking UUID, references, product, booking/travel dates, supported statuses, net amount, currency, Contact fields, and marketing consent.
   - Preserve existing Zoho values for absent/null Contact fields while allowing explicit consent `false` to be written.
   - Handle missing Contact identifiers by syncing the Booking without a Contact link and retaining a diagnostic.
   - Persist source update timestamps sufficiently to prevent an older duplicate payload from overwriting a newer version.

4. **Build the historical import job**
   - Add a Ventrata import-job record with requested date bounds, state, page/checkpoint, record counts, timestamps, and failure details.
   - Extend the Ventrata bookings client to apply travel-date bounds and page through results using OCTO pagination metadata; do not assume one response contains the entire range.
   - Enqueue the job in the existing durable worker infrastructure and return a job ID immediately.
   - Continue after individual booking failures, retry transient errors, persist progress/checkpoints, and allow interrupted jobs to resume safely.
   - Keep webhook processing active during backfill; dedupe by booking UUID and apply the newer-source-timestamp rule.

5. **Add admin operations UI**
   - Add a Ventrata section under Integrations showing connection and webhook status.
   - Provide an admin action to register/repair the webhook and a date-range form to start an import.
   - Show job state, date bounds, progress counts, completion/partial-failure state, and actionable failed-record details.
   - Restrict setup and import actions to authorized admins; never render API keys or webhook secrets.

6. **Validate and roll out**
   - Add deterministic tests with mocked HTTP calls for headers, registration, pagination, payload normalization, idempotency, status mapping, pricing conversion, contact matching, consent, and sparse-field behavior.
   - Test webhook/backfill overlap, stale update rejection, resumability, retries, partial failures, and unauthorized admin access.
   - Validate and apply the Prisma migration, run focused tests and the relevant build checks, then test end-to-end against Ventrata's test supplier and the configured Zoho sandbox before production enablement.

## Acceptance Criteria

- A booking webhook with a valid configured secret is queued and produces the expected Zoho Contact/Booking updates.
- Webhook registration sends the ingress secret as a custom header and uses the supported OCTO capability.
- A bounded travel-date import can be started, monitored, interrupted, resumed, and safely rerun without duplicate bookings.
- All pages in the requested date range are processed; one bad record does not abort the job.
- Unsupported statuses are not silently written as unmapped Zoho picklist values.
- Contact matching and null-preservation rules hold for webhook and import paths; no-identity bookings remain visible without an invented Contact.
- Net amount, currency precision, and marketing consent are mapped correctly, including explicit opt-out.
- Older duplicate booking payloads cannot overwrite newer source data.

## Technical Specifications

### Database Schema & Migration (`prisma/schema.prisma`)

1. **`VentrataImportJob` Model**:
   ```prisma
   model VentrataImportJob {
     id                    String    @id @default(dbgenerated("uuid_generate_v4()")) @db.Uuid
     company_id            String    @db.Uuid
     status                String    @db.VarChar(20) // "in_progress", "completed", "failed"
   booking_date_start    DateTime  @db.Timestamptz(6)
   booking_date_end      DateTime  @db.Timestamptz(6)
     current_page          Int       @default(1)
     bookings_processed    Int       @default(0)
     bookings_failed       Int       @default(0)
     missing_contact_count Int       @default(0)
     started_at            DateTime  @default(now()) @db.Timestamptz(6)
     completed_at          DateTime? @db.Timestamptz(6)
     failure_details       Json?     @db.JsonB

     @@map("ventrata_import_jobs")
   }
   ```

2. **Secret Encryption (`IntegrationConfig`)**:
   Add columns for AES-256-GCM metadata:
   - `ventrata_secret_iv String? @db.VarChar(64)`
   - `ventrata_secret_auth_tag String? @db.VarChar(64)`
   - `ventrata_secret_algorithm String? @default("aes-256-gcm") @db.VarChar(20)`

3. **Source Timestamp Tracking (`IdempotencyMap`)**:
   Add column for version timestamp comparisons:
   - `source_updated_at DateTime? @db.Timestamptz(6)`

### Normalization & Field Mapping (`ventrata-webhook-handler.ts`)

- **Net Amount Conversion**:
  `Booking_Amount` = `netAmount / Math.pow(10, currencyPrecision || 2)`
- **Currency Code**:
  `Currency` = `booking.currency`
- **Marketing Consent**:
  `Marketing_Consent` = `booking.contact.allowMarketing` (explicit `boolean`, preserved on update)
- **No-Identity Contact Handling**:
  If email and phone are absent:
  - Create/update Zoho Booking record with `Contact_Id = null`.
  - Log diagnostic `MISSING_CONTACT_IDENTITY` in `failure_diagnostics` / `failure_details`.
  - Increment `missing_contact_count` on the active `VentrataImportJob`.
- **Stale Payload Rejection**:
  Compare incoming payload timestamp (`booking.utcUpdatedAt`) against `IdempotencyMap.source_updated_at`. If `utcUpdatedAt <= source_updated_at`, skip update processing.

### Background Queue & Worker (`queue.ts` & `worker.ts`)

- **Job Name**: `process-ventrata-import` enqueued on `ventrataWebhookQueue`.
- **Checkpoint & Resumability**:
  - The job processor fetches bookings page-by-page.
  - After completing each page, it updates `current_page`, `bookings_processed`, `bookings_failed`, and `missing_contact_count` on `VentrataImportJob`.
  - If interrupted or retried, worker resumes processing from `current_page`.

### Admin Operations & Express Routes (`src/routes/ventrata-integration.routes.ts`)

- `GET /admin/ventrata-integration`: Renders `views/admin-ventrata-integration.ejs`.
- `POST /api/integrations/ventrata/webhook/register`: Generates, encrypts, and stores `X-Webhook-Secret`, and registers the webhook via `VentrataService`.
- `POST /api/integrations/ventrata/import`: Enqueues `process-ventrata-import` job given `bookingDateStart` and `bookingDateEnd`. The worker queries by `utcCreatedAtStart` and `utcCreatedAtEnd` and uses Ventrata's `perPage` pagination.
- `GET /api/integrations/ventrata/import/status`: Returns current/latest `VentrataImportJob` state and counts.

## Release Blockers

- The Zoho consent field API name (`Marketing_Consent`) and permissions must be confirmed before enabling consent mapping.
- Supplier credentials must be verified for booking-list and webhook capabilities, and the current event/header contract must be validated against the live test account.
