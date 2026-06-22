# WeTravel historic booking backfill with contact linkage

## Parent

#15 WeTravel sync PRD

## What to build

Add a historical import flow that pulls existing WeTravel bookings from the API, ensures the related contact exists in Zoho first, and upserts the booking into the Zoho booking shape using a stable WeTravel booking identifier. The import should be resumable, idempotent, and safe to rerun without creating duplicates.

## Acceptance criteria

- [ ] A company admin can start a historical booking import for a defined scope.
- [ ] Bookings are normalized into the Zoho booking shape before upsert.
- [ ] Related contacts are created or updated before booking upsert when needed.
- [ ] Bookings are upserted by the stable WeTravel booking identifier.
- [ ] The import records progress, failures, and retry state per booking.
- [ ] Rerunning the import does not create duplicate bookings.
- [ ] The operation surfaces completion and failure status in the app.

## Blocked by

- #29 WeTravel historic contact backfill into Zoho
- WeTravel auth/token storage and refresh flow
- Zoho custom booking module readiness
- Shared import/idempotency plumbing

## Implementation Slices

This feature has been broken down into the following vertical slices:

- #035 WeTravel booking sync database schema
- #036 WeTravel single booking sync tracer bullet
- #037 WeTravel all bookings sync with isolated error handling
- #038 WeTravel booking sync metrics in admin UI

## Tags

- enhancement
- integration
- ready-for-agent
