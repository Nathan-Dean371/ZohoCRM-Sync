# ADR 0001: Remove legacy CRM providers and archive source

## Status

Accepted

## Context

The repository previously included multiple CRM provider implementations under `src/services/` (Freshsales, Bitrix, etc.). The new project direction is a focused, internal-only middleware that synchronizes Ventrata bookings into Zoho CRM only. Keeping multiple providers in the main runtime increases maintenance cost and causes accidental/runtime coupling.

## Decision

1. Remove runtime routes and integration plumbing for non-Zoho providers from the main code paths.
2. Move all existing provider folders and related files to `src/legacy_providers/` to preserve history and allow future reference.
3. Keep `zoho` and `ventrata` service code in `src/services/` and treat them as the canonical runtime integrations.
4. Record this decision as an ADR to document why the removal was made.

## Consequences

- Positive
  - Reduced maintenance surface and clearer code paths for the one-shot Ventrata → Zoho pipeline.
  - Smaller attack surface and fewer integration tests to maintain.

- Negative / Trade-offs
  - Removing provider code from runtime may make re-enabling them slightly more work; archived code preserves the implementation but will require re-integration work to restore.
  - Some tests and CI tasks may need updates to reflect the reduced surface area.

## Next steps

- Move provider folders (`Freshsales`, `Bitrix`, etc.) into `src/legacy_providers/` and update imports that referenced them to avoid runtime errors.
- Add/update an ADR index if one does not already exist: `docs/adr/README.md`.
- Update docs/CONTEXT.md to reflect the new single-pipeline architecture.

Date: 2026-06-10

Deciders: Repository Owner / Project Stakeholders
