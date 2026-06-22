# WeTravel validation v2 resources + no-org setup

## Parent

- [PRD: WeTravel API v2 upgrade](031-wetravel-api-v2-upgrade-prd.md)

## What to build

Update the WeTravel credential validation flow so its connectivity, plan, main-account, and permissions checks all use the current v2 resource surface, and remove the organization ID requirement from the auth setup experience where the v2 contract does not use it.

## Acceptance criteria

- [ ] Credential validation calls the v2 WeTravel resource surface by default.
- [ ] The auth setup path no longer requires an organization ID.
- [ ] WeTravel Pro detection still works and still blocks unsupported accounts.
- [ ] Main-account detection still works and still blocks sub-account credentials.
- [ ] Integration permission checks still work and still surface the same validation statuses.
- [ ] Existing admin-facing validation messages remain understandable and consistent.

## Blocked by

None - can start immediately

## Tags

- enhancement
- integration
- ready-for-agent