# WeTravel single booking sync tracer bullet

## Parent

#030 WeTravel historic booking backfill with contact linkage

## What to build

Build the complete end-to-end flow for syncing a single WeTravel booking to Zoho CRM. This tracer bullet establishes the data pipeline from WeTravel API → booking normalization → Zoho upsert → idempotency tracking → job progress update.

Extend the `WeTravelBooking` interface to include booking-specific fields (`product_name`, `travel_date`, `start_date`, `created_at`, `reference`). Add a `normalizeBooking()` private method that extracts and transforms booking data into the Zoho booking shape.

After the service upserts a contact, sync its first associated booking: normalize the booking data, call `zohoService.upsertBooking()`, save the mapping with `idService.saveMapping(bookingRef, 'wetravel_booking', zohoId, 'booking')`, and increment the `bookingsProcessed` counter in the job record.

Write an integration test that proves the complete flow: mock WeTravel API with one trip containing one booking, verify the contact is created first, verify the booking is created with correct linkage, verify idempotency map entry with correct source_type, and verify job counters updated.

## Acceptance criteria

- [ ] `WeTravelBooking` interface includes `product_name`, `travel_date`, `start_date`, `created_at`, and `reference` fields
- [ ] `normalizeBooking()` method extracts and transforms booking data to Zoho shape
- [ ] After contact upsert, service syncs the first booking for that contact
- [ ] Booking saved to Zoho via `upsertBooking()` with `Contact_Id` linkage
- [ ] Booking tracked in idempotency map with `source_type: 'wetravel_booking'`
- [ ] Job record updated with `bookingsProcessed: 1` on success
- [ ] Integration test covers the complete contact → booking → tracking flow
- [ ] Test verifies booking reference used as stable identifier

## Blocked by

#035 WeTravel booking sync database schema

## Tags

- enhancement
- integration
- ready-for-agent
