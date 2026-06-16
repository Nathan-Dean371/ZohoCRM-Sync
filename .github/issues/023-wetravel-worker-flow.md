# Worker flow: contact-first then booking upsert for WeTravel

## What to build

Implement worker-side orchestration for WeTravel events that ensures contact synchronization precedes booking upsert and that booking lifecycle changes (including modifications/cancellations where supported) are reflected consistently in Zoho.

## Acceptance criteria
- [ ] Worker processes normalized WeTravel events asynchronously from queue jobs.
- [ ] Contact sync occurs before booking upsert when contact linkage is required.
- [ ] Booking create/update lifecycle events are reflected in Zoho according to mapping rules.
- [ ] Job status transitions are written through standard webhook log states.

## Blocked by
- #23 WeTravel source adapter + canonical normalization

## Tags
- enhancement
- integration
- ready-for-agent
