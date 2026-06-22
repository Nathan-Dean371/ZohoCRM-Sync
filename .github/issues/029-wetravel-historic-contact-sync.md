# WeTravel historic contact backfill into Zoho

## Parent

#15 WeTravel sync PRD

## What to build

Add a historical import flow that pulls existing WeTravel contacts from the API and upserts them into Zoho CRM. The import should normalize WeTravel contact data, match Zoho records by stable identity where available, and be safe to rerun without creating duplicates.

## Acceptance criteria

- [ ] A company admin can start a historical contact import for a defined scope.
- [ ] Contacts are normalized into the Zoho contact shape before upsert.
- [ ] Existing Zoho contacts are matched by stable identity, with fallback behavior where applicable.
- [ ] The import records progress and failures per contact.
- [ ] Rerunning the import does not create duplicate contacts.
- [ ] The operation surfaces completion and failure status in the app.

## Blocked by

- WeTravel auth/token storage and refresh flow
- Zoho OAuth/token storage and refresh flow
- Shared import/idempotency plumbing

## Tags

- enhancement
- integration
- ready-for-agent
