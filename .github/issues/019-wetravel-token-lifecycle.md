# WeTravel token exchange + refresh lifecycle

## What to build

Implement the WeTravel token lifecycle: secure storage of the one-time seed token material, exchange for short-lived bearer tokens, proactive refresh behavior, and auth health diagnostics consumable by operators.

## Acceptance criteria
- [ ] Runtime obtains WeTravel bearer tokens via the documented token exchange flow.
- [ ] Bearer token refresh is performed before expiry during normal processing.
- [ ] Refresh/exchange failures are surfaced with actionable operator diagnostics.
- [ ] Secrets are not exposed in logs or UI output.

## Blocked by
- #19 WeTravel credential onboarding + validation

## Tags
- enhancement
- integration
- ready-for-agent
