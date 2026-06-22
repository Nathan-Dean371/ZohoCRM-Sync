# Historic Ventrata Booking Sync

## What to build

Add a historical import flow that pulls existing Ventrata bookings, ensures the related contact exists in Zoho, and upserts the booking into the Zoho Bookings custom module using the Ventrata booking UUID. The import should be resumable, idempotent, and safe to rerun without creating duplicates.

## Acceptance criteria
- [ ] A company admin can start a historical booking import for a defined scope.
- [ ] Bookings are normalized into the Zoho booking shape before upsert.
- [ ] Related contacts are created or updated before booking upsert when needed.
- [ ] Bookings are upserted by the Ventrata booking UUID.
- [ ] The import records progress, failures, and retry state per booking.
- [ ] Rerunning the import does not create duplicate bookings.
- [ ] The operation surfaces completion and failure status in the app.

## Blocked by
- #16 Historic Ventrata Contact Sync
- Zoho custom booking module readiness
- Shared import/idempotency plumbing

## Tags
- enhancement
- integration
- ready-for-agent
