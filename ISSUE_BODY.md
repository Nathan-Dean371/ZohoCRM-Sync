**Problem Statement**
Ventrata emits booking webhooks that must be reliably reflected in a Zoho CRM Custom Module. Current approaches are ad-hoc and synchronous, causing lost deliveries, duplicates, and fragile token handling. We need a production-ready middleware to ensure one-way, idempotent, observable sync from Ventrata ? Zoho.

**Solution**
A lightweight Node.js/Express service that:
- Validates Ventrata webhooks via `X-Webhook-Secret`.
- Immediately responds 200 OK and enqueues payloads to Redis/BullMQ.
- Uses background workers to upsert Contacts and Bookings into Zoho (with token refresh, rate limiting, retries, and DLQ).
- Persists minimal config and idempotency mappings locally.
- Provides a minimal admin UI to configure OAuth and webhook secret, and inspect/requeue failures.

**User Stories**
1. As an admin, I want to authenticate the app with Zoho via OAuth, so that the app can obtain a refresh token for API calls.
2. As an admin, I want to register the Ventrata webhook secret in the app, so that incoming webhooks can be validated.
3. As Ventrata, I want the app to return 200 OK immediately upon receipt, so webhook retries are not triggered unnecessarily.
4. As an operator, I want each webhook payload to be enqueued and processed asynchronously, so transient Zoho failures do not block delivery acknowledgements.
5. As an operator, I want worker retries with exponential backoff, so transient errors are automatically retried.
6. As an operator, I want failed jobs to land in a DLQ with metadata, so I can inspect and reprocess permanent failures.
7. As the integration, I want Contacts to be upserted by email (fallback phone), so we minimize duplicate contacts.
8. As the integration, I want Bookings upserted using the `Ventrata_Booking_UUID`, so that syncs are idempotent.
9. As an operator, I want a local idempotency map (`ventrata_uuid -> zoho_record_id`) to avoid unnecessary Zoho queries.
10. As an operator, I want per-token rate limits enforced, so the system respects Zoho API quotas.
11. As an operator, I want the worker to refresh Zoho access tokens automatically using stored refresh tokens, so processing continues without manual reauth.
12. As an admin, I want a simple UI to view webhook logs and DLQ items, so I can diagnose and requeue failed deliveries.
13. As a developer, I want unit tests for webhook validation and worker logic, so behavior is verified during changes.
14. As a developer, I want integration tests that mock Zoho, so we can validate end-to-end worker behavior under failure modes.
15. As an operator, I want webhook payloads persisted in `Webhook_Logs`, so I can replay or audit deliveries.
16. As an operator, I want a configurable retry limit per job, so critical failures can be tuned per environment.
17. As an admin, I want onboarding via a lightweight web UI (OAuth redirect + secret entry), so non-technical users can install the integration.
18. As an operator, I want alerting hooks for DLQ growth, so production issues are surfaced early.
19. As the integration, I want clear, human-readable failure messages in logs, so reprocessing decisions are straightforward.
20. As an architect, I want the system single-company (single `IntegrationConfig`) by default, so initial Ops and schema remain simple.

**Implementation Decisions**
- Single-row `IntegrationConfig` stores `ventrata_webhook_secret`, `zoho_refresh_token`, and token metadata.
- Webhook validation: equality check of header `X-Webhook-Secret` with stored secret.
- Ingress route: POST `/webhook/ventrata` — validate, enqueue, return 200.
- Queue: Redis + BullMQ for reliable background processing; separate worker processes.
- Retry/DLQ: exponential backoff, max 5 retries, then DLQ and mark `Webhook_Logs` as `Failed`.
- Idempotency: local `ventrata_uuid -> zoho_record_id` mapping table.
- Contact matching: upsert by email, fallback to phone, else create.
- Rate limiting: per-Zoho-token concurrency limiter + backoff for 429/5xx.
- Token lifecycle: persist `refresh_token` and `access_token` with `expires_at`; workers refresh before calls.
- Observability: `Webhook_Logs` table with payload, status, attempts, last_error, DLQ ref; minimal admin UI for viewing/requeue.
- Security: restrict admin UI behind JWT-auth routes; store tokens securely.
- Deploy target: Railway (app + Postgres + Redis).

**Testing Decisions**
- Tests assert external behavior only (route responses, DB state, API interactions).
- Unit tests: webhook validation, enqueueing, worker job handling, idempotency updates, token refresh logic (mock Zoho).
- Integration tests: end-to-end worker flow with mocked Zoho; failure scenarios for retries and DLQ.
- Prior art: reuse Jest patterns in `tests/*`.
- CI: run unit + integration tests via `npm test`.

**Out of Scope**
- Multi-tenant/multi-company first-class support (deferred).
- Full Zoho extension beyond Custom Module usage.
- Bi-directional sync or advanced reconciliation.
- Large admin dashboards beyond minimal onboarding and log viewer.

**Further Notes**
- Assumes Ventrata sends `X-Webhook-Secret` and `booking.uuid` is stable.
- Recommend monitoring DLQ length, restrict worker concurrency per token, and enable Redis persistence.

Acceptance checklist:
- [ ] Add Prisma models: `IntegrationConfig`, `Webhook_Logs`, `IdempotencyMap`
- [ ] Implement POST `/webhook/ventrata` route with header validation + enqueue
- [ ] Implement BullMQ worker: contact + booking upsert flow, token refresh, idempotency updates
- [ ] Implement retry + DLQ behavior and persist DLQ metadata
- [ ] Implement minimal admin UI for OAuth onboarding and secret entry
- [ ] Add unit + integration tests (Jest)
- [ ] Add observability: logs/metrics and DLQ dashboard
- [ ] Security review: token storage and admin route protection
- [ ] Deploy to Railway with Postgres + Redis
