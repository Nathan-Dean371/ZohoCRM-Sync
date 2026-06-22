# End-to-end WeTravel test matrix (unit + integration)

## What to build

Implement a WeTravel-specific test matrix (unit and integration) that verifies webhook ingress contracts, token lifecycle behavior, payload normalization, worker sync outcomes, idempotency, DLQ handling, and replay semantics.

## Acceptance criteria
- [ ] Unit tests cover WeTravel ingress validation, token lifecycle branches, and source adapter mapping logic.
- [ ] Integration tests cover queued processing through Zoho sync behavior with mocked external dependencies.
- [ ] Tests verify duplicate-safe behavior under retries and replay.
- [ ] Failure-path tests verify DLQ transitions and diagnosable status outcomes.

## Blocked by
- #28 Rollout guard + staged enablement checks for WeTravel sync

## Tags
- enhancement
- integration
- ready-for-agent
