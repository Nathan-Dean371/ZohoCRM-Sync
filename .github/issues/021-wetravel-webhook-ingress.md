# WeTravel webhook ingress + authenticity gate

## What to build

Introduce WeTravel webhook ingress that validates authenticity, persists initial webhook log state, acknowledges quickly, and enqueues background processing without blocking on Zoho or WeTravel downstream dependencies.

## Acceptance criteria
- [ ] WeTravel webhook endpoint authenticates incoming deliveries according to configured verification mechanism.
- [ ] Valid payloads are persisted to webhook logs before worker execution.
- [ ] Endpoint acknowledges valid deliveries quickly and enqueues processing jobs.
- [ ] Invalid or unauthenticated deliveries are rejected with appropriate status.

## Blocked by
- #20 WeTravel token exchange + refresh lifecycle

## Tags
- enhancement
- integration
- ready-for-agent
