# Rollout guard + staged enablement checks for WeTravel sync

## What to build

Add a controlled rollout guard for WeTravel sync enablement so teams can stage activation, verify production-readiness checks, and progressively enable the integration with reduced blast radius.

## Acceptance criteria
- [ ] WeTravel sync can be enabled/disabled via explicit rollout guard configuration.
- [ ] Guard state is visible to operators/admins in integration diagnostics.
- [ ] Disabled state prevents accidental processing while preserving ingress observability as designed.
- [ ] Rollout procedure supports staged activation and rollback.

## Blocked by
- #27 Source-aware operations view + replay controls (WeTravel)

## Tags
- enhancement
- integration
- ready-for-agent
