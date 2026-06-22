# WeTravel credential onboarding + validation

## What to build

Add an end-to-end admin onboarding flow for WeTravel credentials with explicit validation and setup diagnostics, including clear guidance on WeTravel Pro requirement and primary-account permissions needed to provision integration credentials.

## Acceptance criteria
- [ ] Admin can enter/save WeTravel credential inputs required for integration setup.
- [ ] Setup flow surfaces explicit prerequisite messaging for WeTravel Pro and main-account requirements.
- [ ] Connectivity/validation step returns actionable errors for auth, permissions, and misconfiguration cases.
- [ ] Integration setup state is visible in the app after save/validation.

## Blocked by
- #18 ADR update: multi-source runtime scope (Ventrata + WeTravel -> Zoho)

## Tags
- enhancement
- integration
- ready-for-agent
