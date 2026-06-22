# Historic Ventrata Contact Sync

## What to build

Add a historical import flow that pulls existing Ventrata contacts and upserts them into Zoho CRM. The import should normalize legacy contact data, match Zoho records by email with fallback behavior where needed, and be safe to rerun without creating duplicates.

## Acceptance criteria
- [ ] A company admin can start a historical contact import for a defined scope.
- [ ] Contacts are normalized into the Zoho contact shape before upsert.
- [ ] Existing Zoho contacts are matched by email, with fallback behavior where applicable.
- [ ] The import records progress and failures per contact.
- [ ] Rerunning the import does not create duplicate contacts.
- [ ] The operation surfaces completion and failure status in the app.

## Blocked by
- Ventrata API access for historical contact retrieval
- Zoho OAuth/token storage and refresh flow
- Shared import/idempotency plumbing

## Tags
- enhancement
- integration
- ready-for-agent
