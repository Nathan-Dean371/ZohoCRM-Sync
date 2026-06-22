# ADR 0002: Multi-source runtime scope for Ventrata and WeTravel

## Status

Accepted

## Context

The runtime was originally narrowed to a single source integration path: Ventrata into Zoho CRM. The product scope now includes WeTravel as a first-class source integration as well, while Zoho remains the destination system.

## Decision

1. Support both Ventrata and WeTravel as runtime source integrations.
2. Keep Zoho as the only destination CRM in the shared pipeline.
3. Preserve the existing reliability invariants across both sources: async ingress, worker processing, retries, dead-letter handling, idempotency, and replay.
4. Route source-specific behavior through adapters and source-aware orchestration instead of introducing separate end-to-end pipelines.

## Compatibility constraints

- The current Ventrata -> Zoho flow must continue to work without breaking record matching, retry semantics, or replay behavior.
- WeTravel rollout must be additive; it cannot require removing or rewriting the existing Ventrata path.
- Shared persistence and processing models must preserve source attribution so replay, deduplication, and troubleshooting remain deterministic.

## Consequences

- Positive
  - One operational model for multiple sources keeps the ingestion and worker stack consistent.
  - Source-specific complexity stays isolated to the adapter boundary, which reduces the chance of breaking the existing Ventrata flow.

- Migration / rollout
  - Introduce WeTravel behind source-aware routing and feature flags or equivalent rollout guards.
  - Backfill and replay workflows must include source metadata so historical events can be reprocessed correctly.
  - Implementation issues should reference this ADR when defining source-specific handlers, rollout steps, or replay rules.

Date: 2026-06-16

Deciders: Repository Owner / Project Stakeholders