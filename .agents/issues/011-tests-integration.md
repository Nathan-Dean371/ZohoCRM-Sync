## What to build

Integration tests that mock Zoho to exercise end-to-end worker behavior:
- Mock Zoho endpoints to simulate success, 429, and 5xx.
- Validate retries, token refresh, DLQ movement, and idempotency.

## Acceptance criteria
- [ ] Integration tests simulate Zoho behavior and assert worker outcomes.
- [ ] Tests runnable via `npm test:integration`.

## Blocked by
- [ ] Token manager, worker, and upsert implementations (issues #5, #6)
