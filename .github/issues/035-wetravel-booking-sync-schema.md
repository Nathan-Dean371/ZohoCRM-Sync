# WeTravel booking sync database schema

## Parent

#030 WeTravel historic booking backfill with contact linkage

## What to build

Add database columns to track booking sync progress independently from contact sync in the WeTravel import job table. This provides the foundation for monitoring booking sync metrics separately and enables proper progress reporting when syncing both contacts and bookings.

Add two integer columns to the `wetravel_import_jobs` table:
- `bookings_processed` (default: 0)
- `bookings_failed` (default: 0)

These columns mirror the existing `contacts_processed` and `contacts_failed` pattern, allowing the import service to track both entity types independently.

## Acceptance criteria

- [ ] Prisma schema updated with `bookings_processed` and `bookings_failed` integer columns on `WeTravelImportJob` model
- [ ] Migration file created that adds columns with default value 0
- [ ] Migration is non-breaking (existing jobs continue to work)
- [ ] Migration can be applied to production database safely
- [ ] TypeScript types regenerated to include new fields

## Blocked by

None - can start immediately

## Tags

- enhancement
- database
- ready-for-agent
