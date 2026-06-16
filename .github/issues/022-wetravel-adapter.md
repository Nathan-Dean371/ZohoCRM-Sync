# WeTravel source adapter + canonical normalization

## What to build

Add a WeTravel source adapter that normalizes supported WeTravel events into canonical internal contact/booking shapes and filters unsupported event types safely before worker-side CRM writes.

## Acceptance criteria
- [ ] Supported WeTravel event variants are normalized into canonical internal sync shapes.
- [ ] Unsupported/irrelevant events are skipped safely with explicit log outcome.
- [ ] Normalization contracts are stable and consumable by downstream worker flow.
- [ ] Mapping diagnostics make payload drift visible during failures.

## Blocked by
- #22 WeTravel webhook ingress + authenticity gate

## Tags
- enhancement
- integration
- ready-for-agent
