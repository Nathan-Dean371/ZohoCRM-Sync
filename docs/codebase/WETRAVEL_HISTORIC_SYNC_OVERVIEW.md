# WeTravel Historic Sync: End-to-End

## Goal

This document explains the WeTravel historic sync from click-to-completion, including every endpoint hit by the flow and representative responses.

It describes the implementation currently wired in:

- `src/views/admin-wetravel-integration.ejs`
- `src/routes/wetravel-sync.routes.ts`
- `src/services/wetravel/wetravel-historic-contact-sync-service.ts`
- `src/services/wetravel/wetravel-http-client.ts`
- `src/services/integrations/wetravel-token-manager.ts`
- `src/services/integrations/wetravel-auth.ts`
- `src/services/zoho/zoho-crm-service.ts`

## Start-To-Finish Flow

```mermaid
flowchart TD
        A[Admin clicks Start Historic Sync] --> B[POST /admin/api/wetravel/import-contacts]
        B --> C[Create job: wetravel_import_jobs status=in_progress]
        C --> D[Resolve WeTravel access token]
        D --> E[POST /v2/lead pages for contacts]
        E --> F[Normalize and dedupe contacts]
        F --> G[Zoho contact upserts]
        G --> H[GET /v2/draft_trips]
        H --> I[GET /v2/bookings/trips/{tripUuid}/bookings pages]
        I --> J[Optional GET /v2/bookings/trips/{tripUuid}/bookings/{buyerId}]
        J --> K[Normalize and dedupe bookings]
        K --> L[Zoho booking upserts]
        L --> M[Write idempotency mapping]
        M --> N[Complete job: status=completed or failed]
        N --> O[GET /admin/api/wetravel/import-status/{jobId}]
```

## Detailed Runtime Steps

1. Admin UI asks for confirmation, then calls `POST /admin/api/wetravel/import-contacts`.
2. Route reads `req.user.company_id` and builds `WeTravelAuthService`, `WeTravelTokenManager`, `WeTravelHttpClient`, `ZohoCRMService`, and `WeTravelHistoricContactSyncService`.
3. Sync service creates a row in `wetravel_import_jobs` with `status = in_progress`.
4. Token manager resolves a valid WeTravel bearer token. If missing or expiring soon, it exchanges the seed token.
5. If `fetchLeads` is available, service fetches all leads via paginated `POST /v2/lead` (`per_page = 100`) and normalizes unique contacts.
6. Contacts are upserted into Zoho (`Email` first, `Phone` fallback) and tracked in an in-memory contact key map.
7. Service fetches trips from `GET /v2/draft_trips`.
8. For each trip, service fetches bookings from `GET /v2/bookings/trips/{tripUuid}/bookings` (paginated).
9. For each booking with `trip_uuid + buyer_id`, service tries participant expansion via `GET /v2/bookings/trips/{tripUuid}/bookings/{buyerId}`.
10. If no trip bookings are found and lead access exists, service falls back to booked leads using `POST /v2/lead` with `is_booked=true` (first with `trip_uuids`, then without if needed).
11. Bookings are normalized and upserted into Zoho (`Booking_Ref` lookup key). Contacts are created on-demand if a booking buyer was not already synced.
12. Idempotency mapping is written for successful booking upserts.
13. Job row is updated with counters and final status; route returns the final result payload.

## Endpoints Called

### 1) App Endpoints (Admin Surface)

#### POST /admin/api/wetravel/import-contacts

Starts and runs the full historic sync inline.

Example request:

```http
POST /admin/api/wetravel/import-contacts
Content-Type: application/json

{}
```

Example success response (`200`):

```json
{
    "message": "Import completed successfully",
    "result": {
        "id": "job_01J1XYZABCDEF",
        "status": "completed",
        "contactsProcessed": 128,
        "contactsFailed": 3,
        "bookingsProcessed": 94,
        "bookingsFailed": 5,
        "startedAt": "2026-07-10T14:05:11.000Z",
        "completedAt": "2026-07-10T14:09:42.000Z"
    }
}
```

Example failure response (`500`):

```json
{
    "error": "Failed to start import",
    "message": "WeTravel bearer token exchange failed: WeTravel token exchange failed with HTTP 401"
}
```

#### GET /admin/api/wetravel/import-status/:jobId

Returns current/final persisted job status.

Example response (`200`):

```json
{
    "id": "job_01J1XYZABCDEF",
    "status": "completed",
    "contactsProcessed": 128,
    "contactsFailed": 3,
    "bookingsProcessed": 94,
    "bookingsFailed": 5,
    "startedAt": "2026-07-10T14:05:11.000Z",
    "completedAt": "2026-07-10T14:09:42.000Z"
}
```

Example not found (`404`):

```json
{
    "error": "Import job not found"
}
```

### 2) WeTravel Endpoints

Base URL behavior:

- Defaults to `https://api.wetravel.com/v2`.
- If configured base URL does not end with `/v2`, `/v2` is appended.

#### POST /v2/auth/tokens/access

Purpose: exchange seed token for access token.

Example request headers:

```http
POST /v2/auth/tokens/access
Accept: application/json
Authorization: Bearer <seed-token>
```

Example response (`200`):

```json
{
    "access_token": "<jwt>",
    "refresh_token": "<refresh>",
    "token_type": "Bearer",
    "expires_in": 3600,
    "scope": "rw:all"
}
```

#### POST /v2/lead

Purpose: fetch contact leads (and fallback booked leads).

Example request body (contact pass):

```json
{
    "page": 1,
    "per_page": 100,
    "sort_by": "recent_requested_at",
    "sort_dir": "desc"
}
```

Example request body (booked fallback pass):

```json
{
    "page": 1,
    "per_page": 100,
    "sort_by": "recent_requested_at",
    "sort_dir": "desc",
    "trip_uuids": ["trip-uuid-1", "trip-uuid-2"],
    "is_booked": true
}
```

Example response (`200`):

```json
{
    "leads": [
        {
            "id": "lead_001",
            "reference": "WT-LEAD-001",
            "product_name": "Iceland Expedition",
            "created_at": "2026-06-01T10:00:00Z",
            "customer": {
                "first_name": "Ada",
                "last_name": "Lovelace",
                "email": "ada@example.com",
                "phone": "+15555550001",
                "country": "GB"
            }
        }
    ],
    "pagination": {
        "current_page": 1,
        "per_page": 100,
        "total_count": 240,
        "total_pages": 3
    }
}
```

#### GET /v2/draft_trips

Purpose: list trips used as booking fetch roots.

Example response (`200`):

```json
{
    "data": [
        {
            "uuid": "trip-uuid-1",
            "title": "Summer Adventure"
        },
        {
            "uuid": "trip-uuid-2",
            "title": "Winter Escape"
        }
    ]
}
```

#### GET /v2/bookings/trips/{tripUuid}/bookings?page={n}&per_page=100

Purpose: fetch bookings for one trip with pagination.

Example response (`200`):

```json
{
    "bookings": [
        {
            "id": "booking_001",
            "reference": "WT-BOOK-001",
            "trip_uuid": "trip-uuid-1",
            "buyer_id": "buyer-101",
            "product_name": "Summer Adventure",
            "travel_date": "2026-07-15",
            "created_at": "2026-06-01T10:00:00Z",
            "total_amount": "1299.00",
            "currency_code": "USD",
            "buyer": {
                "first_name": "Grace",
                "last_name": "Hopper",
                "email": "grace@example.com",
                "phone": "+15555550002",
                "country": "US"
            }
        }
    ],
    "pagination": {
        "current_page": 1,
        "per_page": 100,
        "total_count": 125,
        "total_pages": 2
    }
}
```

404 behavior:

- If this endpoint returns `404` for a specific trip, that trip is skipped and sync continues.

#### GET /v2/bookings/trips/{tripUuid}/bookings/{buyerId}

Purpose: fetch participant details and expand booking contacts.

Example response (`200`):

```json
{
    "participants": [
        {
            "id": "p-001",
            "first_name": "Damian",
            "last_name": "Stone",
            "email": "damian@example.com",
            "survey": [
                {
                    "type": "phone",
                    "answers": ["+15555550003"]
                }
            ]
        }
    ]
}
```

404 behavior:

- A `404` returns `null` from client code and participant expansion is skipped for that booking.

### 3) Zoho CRM Endpoints

Base URL behavior:

- `ZOHO_API_DOMAIN` is normalized to include `/crm/v3`.

#### Contacts search and upsert path

- `GET /crm/v3/Contacts/search?criteria=(Email:equals:{email})`
- `GET /crm/v3/Contacts/search?criteria=(Phone:equals:{phone})` (fallback)
- `POST /crm/v3/Contacts` (create)
- `PUT /crm/v3/Contacts/{id}` (update)

Example create response shape (`200`):

```json
{
    "data": [
        {
            "code": "SUCCESS",
            "message": "record added",
            "details": {
                "id": "5725767000001234567"
            }
        }
    ]
}
```

#### Bookings search and upsert path

- `GET /crm/v3/Bookings/search?criteria=(Booking_Ref:equals:{ref})`
- `POST /crm/v3/Bookings` (create)
- `PUT /crm/v3/Bookings/{id}` (update)

Example create response shape (`200`):

```json
{
    "data": [
        {
            "code": "SUCCESS",
            "message": "record added",
            "details": {
                "id": "5725767000007654321"
            }
        }
    ]
}
```

## Normalization Rules Used By Sync

### Contact Keying and Dedup

- Primary key: lowercased email.
- Secondary key: `phone:{phone}` when email missing.
- Last fallback: `lead:{id}`.
- Duplicate lead contacts are merged by picking the more informative value per field.

### Booking Field Mapping To Zoho

Each booking is mapped to Zoho with:

- `Booking_Ref`: WeTravel booking reference.
- `Name`: product name.
- `Product`: product name.
- `Contact_Id`: resolved Zoho contact id.
- `Travel_Date`: travel/start date.
- `Booking_Date`: formatted `created_at`.
- `Booking_Amount`: parsed from `total_amount`, then `paid_amount`, then `amount`.
- `Booking_Currency`: uppercased `currency_code` or `currency`.

Example outbound Zoho booking payload:

```json
{
    "Booking_Ref": "WT-BOOK-001",
    "Name": "Summer Adventure",
    "Contact_Id": "5725767000001234567",
    "Product": "Summer Adventure",
    "Travel_Date": "2026-07-15",
    "Booking_Date": "2026-06-01T10:00:00+00:00",
    "Booking_Amount": 1299,
    "Booking_Currency": "USD"
}
```

## Import Job Persistence

Table: `wetravel_import_jobs`

Tracked fields:

- `status`: `in_progress | completed | failed`
- `contacts_processed`
- `contacts_failed`
- `bookings_processed`
- `bookings_failed`
- `started_at`
- `completed_at`
- `error_message`

Example final persisted state:

```json
{
    "id": "job_01J1XYZABCDEF",
    "company_id": "company_123",
    "status": "completed",
    "contacts_processed": 128,
    "contacts_failed": 3,
    "bookings_processed": 94,
    "bookings_failed": 5,
    "started_at": "2026-07-10T14:05:11.000Z",
    "completed_at": "2026-07-10T14:09:42.000Z",
    "error_message": null
}
```

## Error Semantics

- Contact upsert failures increment `contacts_failed` and sync continues.
- Booking upsert failures increment `bookings_failed` and sync continues.
- Trip booking `404` is non-fatal for that trip and is skipped.
- Unhandled top-level errors mark the job `failed` and set `error_message`.

## Current Operational Notes

- The import route is synchronous from the HTTP caller point of view and returns only after the full run.
- Status endpoint is still useful for persisted counters and post-run auditing.
- Idempotency mapping is written after each successful booking upsert.
- In current code, `saveMapping(booking.reference, zohoBooking.id)` is called without explicit `sourceType`, so the default source type is used.

## Quick Source Index

- `src/views/admin-wetravel-integration.ejs`
- `src/routes/wetravel-sync.routes.ts`
- `src/services/wetravel/wetravel-historic-contact-sync-service.ts`
- `src/services/wetravel/wetravel-http-client.ts`
- `src/services/integrations/wetravel-auth.ts`
- `src/services/integrations/wetravel-token-manager.ts`
- `src/services/zoho/zoho-crm-service.ts`
- `src/services/database/idempotency-service.ts`
