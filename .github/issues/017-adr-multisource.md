# ADR update: multi-source runtime scope (Ventrata + WeTravel -> Zoho)

## What to build

Create an ADR update that formalizes WeTravel as a first-class source integration alongside Ventrata while preserving Zoho as the destination and keeping existing reliability invariants (async ingress, worker processing, retries, DLQ, idempotency, replay).

## Acceptance criteria
- [ ] ADR text clearly states the updated runtime integration scope and rationale.
- [ ] ADR records compatibility constraints with the current Ventrata->Zoho flow.
- [ ] ADR defines migration/rollout implications for introducing WeTravel source handling.
- [ ] ADR is linked from project decision docs so downstream implementation issues can reference it.

## Blocked by
None - can start immediately

## Tags
- enhancement
- integration
- ready-for-agent
