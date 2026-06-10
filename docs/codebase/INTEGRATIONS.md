# INTEGRATIONS

External systems integrated (verified by service code and dependencies):

- CRM providers implemented under `src/services/`:
	- Zoho (`src/services/zoho/`)
	- Freshsales (`src/services/Freshsales/`)
	- Ventrata (`src/services/ventrata/`)
	- Bitrix (`src/services/Bitrix/`)
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
- [package.json](../../package.json)
- [prisma/schema.prisma](../../prisma/schema.prisma)

[TODO] Enumerate exact env variable names and auth flows by scanning each service file.

