# WeTravel idempotency + replay-safe reprocessing

## What to build

Add WeTravel idempotency behavior and replay-safe processing guarantees so repeated deliveries, retries, or manual replays do not create duplicate CRM booking records.

## Acceptance criteria
- [ ] Stable WeTravel identifiers are used to enforce idempotent booking upsert behavior.
- [ ] Replay/retry of the same logical event remains duplicate-safe.
- [ ] Idempotency state is persisted and queryable for operational troubleshooting.
- [ ] Reprocessing outcomes are deterministic across repeated runs.

## Blocked by
- #24 Worker flow: contact-first then booking upsert for WeTravel

## Tags
- enhancement
- integration
- ready-for-agent
