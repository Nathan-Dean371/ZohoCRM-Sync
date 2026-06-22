# WeTravel v2 defaults + docs

## Parent

- [PRD: WeTravel API v2 upgrade](031-wetravel-api-v2-upgrade-prd.md)

## What to build

Normalize the WeTravel integration so the v2 API base is the default contract everywhere it matters, the setup flow no longer asks for an organization ID when it is not part of the contract, and the repo guidance reflects the supported version.

## Acceptance criteria

- [ ] The WeTravel API base defaults to the v2 root.
- [ ] Explicit base URL and token URL overrides still work.
- [ ] The admin setup flow does not require an organization ID for v2 auth.
- [ ] Repo documentation reflects the current WeTravel v2 contract.
- [ ] The upgrade does not change the Ventrata or Zoho paths.
- [ ] The change remains additive and does not require schema migration.

## Blocked by

- [WeTravel auth v2 access-token flow](032-wetravel-auth-v2-access-token-flow.md)
- [WeTravel validation v2 resources + no-org setup](033-wetravel-validation-v2-resources.md)

## Tags

- enhancement
- integration
- ready-for-agent