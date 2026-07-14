# INTEGRATIONS

External systems integrated (verified by service code and dependencies):

Runtime source integrations are scoped by the ADR index in [docs/adr/README.md](../adr/README.md). The current runtime scope is Ventrata and WeTravel as sources, with Zoho as the destination CRM.

WeTravel uses the v2 API contract by default. Admin setup and token exchange should target the v2 root unless a specific override is supplied.

- CRM providers implemented under `src/services/`:
	- Zoho (`src/services/zoho/`)
	- Freshsales (`src/services/Freshsales/`)
	- Ventrata (`src/services/ventrata/`)
	- Bitrix (`src/services/Bitrix/`)
- Operational setup guidance:
	- WeTravel Zoho admin SOP ([docs/codebase/WE_TRAVEL_ZOHO_ADMIN_SOP.md](WE_TRAVEL_ZOHO_ADMIN_SOP.md))
	- WeTravel historic sync overview ([docs/codebase/WETRAVEL_HISTORIC_SYNC_OVERVIEW.md](WETRAVEL_HISTORIC_SYNC_OVERVIEW.md))
- Email: `nodemailer` used for sending emails (`package.json`).
- Tunnels and webhook handling: webhook endpoints and tunnel services in `src/services/Tunnels` and `src/routes/webhook.routes.ts`.
- Dev tooling: `ngrok` appears as a dev dependency (used for exposing local webhooks in development).

Environment and secrets:

- Database connection via `DATABASE_URL` (referenced by Prisma in `prisma/schema.prisma`).
- Other provider-specific credentials stored/handled in `src/services/*` (exact env var names not centralized in repo).

Evidence (selected):

- [src/services/zoho/zoho-crm-service.ts](../../src/services/zoho/zoho-crm-service.ts)
- [src/services/Freshsales/freshsales-crm-service.ts](../../src/services/Freshsales/freshsales-crm-service.ts)
- [src/services/ventrata/ventrata-service.ts](../../src/services/ventrata/ventrata-service.ts)
- [docs/adr/0002-multisource-runtime-scope.md](../adr/0002-multisource-runtime-scope.md)
- [package.json](../../package.json)
- [prisma/schema.prisma](../../prisma/schema.prisma)

[TODO] Enumerate exact env variable names and auth flows by scanning each service file.

