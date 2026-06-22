# Retry classification + DLQ + failure diagnostics for WeTravel

## What to build

Extend retry classification and DLQ handling for WeTravel processing to distinguish transient from permanent failures, persist failure diagnostics, and support safe operational requeue behavior.

## Acceptance criteria
- [ ] Transient failures retry with backoff under worker policy.
- [ ] Permanent failures are marked failed and routed to DLQ references.
- [ ] Failure diagnostics include enough context for human triage and replay.
- [ ] Log status progression remains consistent across retries and terminal failure.

## Blocked by
- #24 Worker flow: contact-first then booking upsert for WeTravel

## Tags
- enhancement
- integration
- ready-for-agent
