# ARCHITECTURE

Overview (evidence-backed):

The runtime integration scope is documented in [docs/adr/README.md](../adr/README.md) and [ADR 0002](../adr/0002-multisource-runtime-scope.md): the shared pipeline accepts Ventrata and WeTravel as sources and writes to Zoho as the destination.

- The application is an Express-based server that handles HTTP requests and renders EJS views.
- Typical request flow: HTTP request → route (`src/routes/*`) → controller (`src/controllers/*`) → service (`src/services/*`) → persistence via Prisma (`prisma/schema.prisma`).
- Prisma is the primary data access layer targeting PostgreSQL; migrations live under `prisma/migrations/`.
- Background or tooling scripts: `src/scripts/` (e.g., `tunnel.ts`) and various `src/services/*` handlers for webhooks and integrations.

Evidence (selected):

- [src/routes/tunnels.routes.ts](../../src/routes/tunnels.routes.ts)
- [src/controllers/webhook-controller.ts](../../src/controllers/webhook-controller.ts)
- [src/services/Tunnels/TunnelService.ts](../../src/services/Tunnels/TunnelService.ts)
- [prisma/schema.prisma](../../prisma/schema.prisma)

[TODO] Add architecture diagram and async/job flow if requested.

