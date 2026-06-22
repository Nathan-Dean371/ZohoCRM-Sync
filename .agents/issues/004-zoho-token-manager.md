## What to build

Implement a Zoho token manager service that:
- Refreshes `access_token` using stored `refresh_token` before expiry.
- Persists tokens and expiry metadata to `IntegrationConfig`.
- Provides a per-token rate limiting/concurrency wrapper and 429/backoff handling.

## Acceptance criteria
- [x] Token refresh works and updates DB.
- [x] Exposes a `withZohoToken` helper that enforces concurrency limits.
- [x] 429/5xx responses trigger exponential backoff and retry integration.

## Blocked by
- [ ] [Admin OAuth UI](https://github.com/Nathan-Dean371/OCTOtoCRM/issues/4)
- [ ] [DB models](https://github.com/Nathan-Dean371/OCTOtoCRM/issues/2)
