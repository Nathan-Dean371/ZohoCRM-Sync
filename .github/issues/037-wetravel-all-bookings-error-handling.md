# WeTravel all bookings sync with isolated error handling

## Parent

#030 WeTravel historic booking backfill with contact linkage

## What to build

Extend the single-booking tracer bullet to sync all bookings for all contacts, with isolated error handling that prevents individual booking failures from halting contact processing or the entire import job.

Iterate through all trips, then all bookings within each trip. For each booking, wrap the sync operation (normalize → upsert → track) in a try/catch block. On success, increment `bookingsProcessed`. On failure, log the error, increment `bookingsFailed`, and continue to the next booking without throwing.

The import job completes with status "completed" even if some bookings fail, enabling a partial success model. The `bookingsFailed` counter provides diagnostic visibility into problem bookings.

Add tests for:
- Missing required booking fields (product_name, travel_date)
- Zoho API failures during booking upsert
- WeTravel API returning malformed booking data
- Partial success: some bookings succeed, others fail, job still completes
- Multiple contacts with multiple bookings each

## Acceptance criteria

- [ ] Service loops through all trips and all bookings for each trip
- [ ] Each booking sync wrapped in individual try/catch for isolation
- [ ] Booking failures increment `bookingsFailed` counter and log error
- [ ] Contact processing continues even if bookings fail
- [ ] Import job completes with "completed" status despite partial booking failures
- [ ] Tests cover missing data, API failures, and partial success scenarios
- [ ] Tests verify contact sync continues independently of booking failures
- [ ] Final job status reflects both contact and booking success/failure metrics

## Blocked by

#036 WeTravel single booking sync tracer bullet

## Tags

- enhancement
- integration
- ready-for-agent
