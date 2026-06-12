## What to build

Implement retry policy and DLQ sink plus admin DLQ viewer:
- Exponential backoff retry policy (configurable max attempts).
- After max retries, move job to DLQ with metadata and mark `Webhook_Logs` as `Failed`.
- Admin UI to view DLQ items and requeue manually.

## Acceptance criteria
- [ ] Retries happen with exponential backoff.
- [ ] Jobs exhausted move to DLQ with metadata persisted.
- [ ] UI exposes DLQ items and allows requeue.

## Blocked by
- [ ] [Worker skeleton](https://github.com/Nathan-Dean371/OCTOtoCRM/issues/6)
- [ ] [DB models](https://github.com/Nathan-Dean371/OCTOtoCRM/issues/2)
