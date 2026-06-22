# WeTravel booking sync metrics in admin UI

## Parent

#030 WeTravel historic booking backfill with contact linkage

## What to build

Surface booking sync metrics in the WeTravel admin integration page so operators can monitor both contact and booking import progress. Display booking statistics alongside existing contact statistics, providing complete visibility into the historic sync operation.

Update the `ImportStatus` interface to include `bookingsProcessed` and `bookingsFailed` fields. Update the admin UI template (`admin-wetravel-integration.ejs`) to display these metrics in the sync details section. Update the frontend JavaScript to render booking metrics when polling for sync status.

The UI should display:
- Bookings Processed: [count]
- Bookings Failed: [count]

These should appear below the existing contact metrics, maintaining consistent styling and layout.

## Acceptance criteria

- [ ] `ImportStatus` interface includes `bookingsProcessed` and `bookingsFailed` number fields
- [ ] Admin UI template includes booking metric display elements in sync details section
- [ ] Frontend JavaScript updates booking metrics when checking sync status
- [ ] Booking metrics styled consistently with contact metrics
- [ ] API endpoint returns booking metrics in import status response
- [ ] Metrics display correctly for in-progress, completed, and failed imports
- [ ] Zero values display appropriately before booking sync starts

## Blocked by

#037 WeTravel all bookings sync with isolated error handling

## Tags

- enhancement
- ui
- ready-for-agent
