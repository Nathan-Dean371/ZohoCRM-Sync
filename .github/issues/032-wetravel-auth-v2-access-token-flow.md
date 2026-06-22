# WeTravel auth v2 access-token flow

## Parent

- [PRD: WeTravel API v2 upgrade](031-wetravel-api-v2-upgrade-prd.md)

## What to build

Update the WeTravel auth flow so the integration exchanges the stored partner API key through the documented v2 access-token endpoint without requiring an organization ID, while keeping the existing token model, refresh behavior, and operator-facing error handling intact.

## Acceptance criteria

- [ ] WeTravel access-token issuance uses the v2 auth endpoint by default.
- [ ] The auth request does not require or send an organization ID.
- [ ] The auth client still returns the same token shape expected by the token manager.
- [ ] Failed token exchange still produces a clear operator-facing error.
- [ ] Existing token persistence behavior remains unchanged.

## Blocked by

None - can start immediately

## Tags

- enhancement
- integration
- ready-for-agent