## What to build

Add a BullMQ worker skeleton and job processing pipeline:
- Worker consumes the webhook queue and dispatches to handlers.
- Integrates with Zoho token manager for API calls.
- Provides clear error semantics for retry vs permanent failure.

## Acceptance criteria
- [ ] Worker process connects to Redis and consumes jobs.
- [ ] Token manager integrated for API calls.
- [ ] Errors are classified for retry vs DLQ movement.

## Blocked by
- [ ] [Webhook ingress](https://github.com/Nathan-Dean371/OCTOtoCRM/issues/3)
- [ ] [Zoho token manager](https://github.com/Nathan-Dean371/OCTOtoCRM/issues/5)
