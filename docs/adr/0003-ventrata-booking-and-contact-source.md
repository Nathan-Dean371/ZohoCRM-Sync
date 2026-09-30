# Ventrata booking and contact source

Status: accepted

Ventrata remains a first-class source to Zoho through the reseller-facing OCTO API, with one supplier connection per deployment and the API key managed as a deployment secret. Contacts are booking-derived; live webhook events and an admin-started, travel-date-bounded historical booking import both use the same booking upsert path. The booking UUID is the canonical Zoho reference and idempotency key, and the initial lifecycle scope is Confirmed, Cancelled, and Redeemed.

Ventrata is authoritative for mapped values it supplies, but missing or null Contact values do not clear Zoho data. Match Contacts by email first and phone second; do not create an unlinked Contact when neither identifier exists, but still sync and report the Booking without a Contact link. Map supplier net price (converted from minor units using currency precision) and currency to Zoho, and map `allowMarketing` to a Zoho consent field.

The app registers the booking webhook with a generated secret shared through `X-Webhook-Secret`; store that secret encrypted and validate it at ingress. Backfills run as durable background jobs with progress and per-record failures. When the same Booking arrives from both paths, the payload with the newer Ventrata update timestamp wins. This favors reliable recovery and consistent identity over a minimal webhook-only integration; API capabilities, webhook event shape, and Zoho field availability must be confirmed before rollout.