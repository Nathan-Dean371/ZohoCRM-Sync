# PRD: WeTravel API v2 upgrade

## Problem Statement

The WeTravel integration is still using v1-style API assumptions in parts of the codebase, which means we are not consistently aligned with the current WeTravel v2 developer docs. The integration also still expects an organization ID in places where the v2 auth contract does not require one. The integration needs to use the v2 authentication and resource surfaces so that credential validation, token issuance, and downstream WeTravel requests all follow the supported contract.

## Solution

Update the WeTravel integration to use the v2 API as the default contract everywhere it talks to WeTravel. That includes the access-token flow and the validation probes used to confirm a connection, plan status, main-account status, and permissions. The result should be a WeTravel integration that defaults to v2 endpoints, no longer requires an organization ID for the v2 auth path, still allows explicit overrides when needed, and keeps the existing admin and worker behavior intact.

## User Stories

1. As an administrator, I want the WeTravel integration to use the current v2 API by default, so that the app follows the supported WeTravel contract.
2. As an administrator, I want access token issuance to use the documented v2 auth endpoint without requiring an organization ID, so that refresh-token exchange works with the current WeTravel platform.
3. As an administrator, I want credential validation to call v2 WeTravel resources without asking for an organization ID during auth setup, so that setup checks reflect the same API version used in production.
4. As an operator, I want the integration to keep the existing WeTravel setup flow, so that I do not need to relearn the admin UI or reconfigure unrelated settings.
5. As an operator, I want the app to continue supporting explicit API base URL overrides, so that non-default environments can still be tested or isolated.
6. As a developer, I want the auth client and validator to share the same versioned base URL convention, so that WeTravel calls do not drift between modules.
7. As a developer, I want the token exchange request to match the current WeTravel auth documentation, so that future maintenance is based on the published contract rather than legacy behavior.
8. As an operator, I want validation failures to preserve the current status categories, so that existing admin feedback remains meaningful.
9. As an operator, I want WeTravel Pro checks to keep working after the version bump, so that plan eligibility still blocks unsupported accounts.
10. As an operator, I want main-account and permission checks to keep working after the version bump, so that the integration still rejects unsupported account setups.
11. As a maintainer, I want the WeTravel code paths to remain isolated from the Ventrata pipeline, so that the v2 upgrade does not disturb the other source integration.
12. As a maintainer, I want the upgrade to be additive and low-risk, so that it can be rolled out without a broader integration rewrite.
13. As a maintainer, I want test coverage around the versioned endpoints and the no-organization-ID auth flow, so that future API changes are caught quickly.
14. As a maintainer, I want the existing WeTravel Jest slices to keep validating external behavior, so that implementation details stay flexible.
15. As an operator, I want any stored token metadata to remain compatible with the existing integration config model, so that no unnecessary data migration is introduced.
16. As an admin, I want the setup flow to stop asking for an organization ID when it is not part of the v2 contract, so that the form matches the current WeTravel authentication model.
17. As an operator, I want the webhook and admin setup URLs to remain unchanged, so that the version upgrade does not create a new operational workflow.
18. As an operator, I want the integration to surface clear errors when v2 requests fail, so that bad credentials or unsupported account states are easy to diagnose.
19. As a developer, I want a single source of truth for the WeTravel API base URL, so that future endpoint changes can be made in one place.
20. As a maintainer, I want the v2 upgrade to be documented in the repo’s domain docs, so that the current API contract is discoverable.

## Implementation Decisions

- Make WeTravel v2 the default API contract for all WeTravel-facing requests.
- Set the default WeTravel API base to the v2 root instead of the legacy root.
- Update access-token issuance to target the documented v2 auth token endpoint.
- Align the auth request shape with the published WeTravel v2 authentication contract, using only the refresh token where the contract requires it and not sending an organization ID to auth.
- Update validator probes to use the v2 resource paths for organization, plan, and integration checks where those endpoints are still required.
- Remove organization ID as a required setup input for the auth flow and update dependent validation/UI behavior accordingly.
- Preserve the existing WeTravel validation result states and admin-facing status categories.
- Keep environment overrides available for the API base and token URL so that integration testing and special environments remain possible.
- Avoid schema changes unless a follow-up requirement proves they are necessary; this upgrade should be endpoint- and contract-focused first.
- Keep the Ventrata and Zoho paths untouched; this PRD only concerns the WeTravel source integration surface.
- Use the existing WeTravel service boundary as the main seam for the upgrade, with tests exercising the public behavior of the auth client, validator, and setup flow rather than internal request construction.

## Testing Decisions

- Good tests should verify observable behavior: the URL surface used for token exchange and validation, the resulting success/failure statuses, and the fact that existing admin-facing outcomes remain stable.
- Test the WeTravel auth client at the service boundary by asserting it talks to the v2 access-token endpoint, does not require an organization ID, and produces the same token model expected by the token manager.
- Test the WeTravel validator at the service boundary by asserting it uses the v2 resource paths, no longer requires an organization ID in the auth setup path, and still maps failures into the current validation statuses.
- Keep token-manager tests focused on downstream behavior: if a token exchange succeeds, the manager should persist the new token state exactly as before; if it fails, the operator-facing error should remain actionable.
- Prior art already exists in the repository’s WeTravel Jest slices, including validator, token-manager, route, and credential-persistence tests, so the upgrade should extend those patterns instead of introducing a new testing style.
- Favor focused unit tests around the existing WeTravel service modules rather than broad end-to-end tests, since the change is a contract update and not a workflow redesign.

## Out of Scope

- Reworking the broader WeTravel admin onboarding flow.
- Changing the WeTravel webhook ingress contract.
- Altering the Zoho destination pipeline or any Ventrata behavior.
- Introducing new database tables or a new integration data model unless a later implementation discovers a genuine need.
- Building a new abstraction for version negotiation between WeTravel API versions.
- Migrating historical WeTravel records or reprocessing existing events just because the API version changes.
- Designing a full API compatibility shim for both v1 and v2 at runtime.

## Further Notes

The current repo context shows WeTravel as a first-class source integration under ADR 0002, so the upgrade should stay additive and should not disturb the existing Ventrata -> Zoho path. The most likely implementation seams are the WeTravel auth service, the WeTravel validator, the admin setup form, and the existing WeTravel Jest slices that already cover those modules.

The WeTravel docs indicate the access-token flow now lives under `https://api.wetravel.com/v2/auth/tokens/access`, and the auth page does not reference an organization ID for that exchange. That makes the version bump primarily a contract alignment task rather than a behavioral rewrite.

## Tags

- integration
- ready-for-agent