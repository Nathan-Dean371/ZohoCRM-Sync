# STRUCTURE

High-level repository structure (verified):

- `src/` — application source code.
	- `src/server.ts`, `src/app.ts` — server entrypoints and app configuration.
	- `src/routes/` — route definitions (e.g., `tunnels.routes.ts`, `webhook.routes.ts`).
	- `src/controllers/` — controllers handling request logic (e.g., `webhook-controller.ts`).
	- `src/services/` — business logic and integrations (providers under `src/services/*`).
	- `src/views/` — EJS templates used for server-side rendering.
	- `src/public/` — static assets (CSS, JS, fonts).
- `prisma/` — Prisma schema and migrations.
- `tests/` — unit/integration tests (project contains test files under `tests/`).
- Root files: `package.json`, `tsconfig.json`, `jest.config.js`, `PROJECT_CONTEXT.md`.

Entry points to inspect:

- [src/server.ts](../../src/server.ts)
- [src/app.ts](../../src/app.ts)
- [src/routes/tunnels.routes.ts](../../src/routes/tunnels.routes.ts)

Evidence (selected):

- [src/server.ts](../../src/server.ts)
- [src/app.ts](../../src/app.ts)
- [src/routes/](../../src/routes/)
- [prisma/schema.prisma](../../prisma/schema.prisma)

[TODO] Add TypeScript path alias mapping if present (none found in `tsconfig.json`).

