# Source-aware operations view + replay controls (WeTravel)

## What to build

Deliver source-aware operations views and replay controls so operators can filter WeTravel vs Ventrata logs, inspect processing state, and requeue events with clear visibility into outcomes.

## Acceptance criteria
- [ ] Operations UI/API can filter and inspect webhook logs by source integration.
- [ ] Operators can requeue eligible WeTravel events from log history.
- [ ] Replay actions update status history and preserve auditability.
- [ ] Operational views expose enough context to diagnose sync failures quickly.

## Blocked by
- #25 WeTravel idempotency + replay-safe reprocessing
- #26 Retry classification + DLQ + failure diagnostics for WeTravel

## Tags
- enhancement
- integration
- ready-for-agent
