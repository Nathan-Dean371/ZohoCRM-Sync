# OCTOtoCRM

OCTOtoCRM is a TypeScript application that receives booking and customer data
from Ventrata and WeTravel, processes webhook work asynchronously, and syncs
records to Zoho CRM. It provides an Express web application and uses PostgreSQL
for persistence and Redis with BullMQ for background jobs.

## Requirements

- Node.js 20 or later
- npm
- PostgreSQL
- Redis

## Getting started

1. Install dependencies:

   ```sh
   npm ci
   ```

2. Copy `.env.example` to `.env` and configure the values for your local
   PostgreSQL and Redis instances. Add the provider credentials needed for the
   integrations you intend to run. Keep `.env` private; do not commit it.

3. Apply the database migrations:

   ```sh
   npx prisma migrate deploy
   ```

4. Start the development server:

   ```sh
   npm run dev
   ```

The server listens on port `3000` by default. Set `PORT` to change it. The
webhook worker runs in the server process and connects to Redis, so both the
database and Redis should be available when the application starts.

To create a production build and run it:

```sh
npm run build
npm start
```

## Common commands

| Command | Description |
| --- | --- |
| `npm run dev` | Run the TypeScript server with automatic restarts |
| `npm run build` | Compile the application into `dist/` |
| `npm start` | Run the compiled server |
| `npm test` | Run the Jest test suite |
| `npm run lint` | Run ESLint |
| `npm run tunnel` | Start the local webhook tunnel utility |
| `npm run reconcile:wetravel` | Run the WeTravel idempotency reconciliation utility |

## Configuration

Use [.env.example](.env.example) as the reference for supported environment
variables. Core settings include:

- `DATABASE_URL` for PostgreSQL
- `REDIS_HOST`, `REDIS_PORT`, and optional Redis password/TLS settings for
  BullMQ
- `SESSION_SECRET`, `JWT_SECRET`, and credential-encryption keys
- Ventrata, WeTravel, and Zoho API and webhook credentials

Only configure production secrets in the production environment's secret
manager. See the [security checklist](docs/codebase/SECURITY_CHECKLIST.md) for
credential handling guidance.

## Project documentation

- [Architecture](docs/codebase/ARCHITECTURE.md)
- [Integrations](docs/codebase/INTEGRATIONS.md)
- [Testing](docs/codebase/TESTING.md)
- [WeTravel historic sync overview](docs/codebase/WETRAVEL_HISTORIC_SYNC_OVERVIEW.md)
- [WeTravel and Zoho admin SOP](docs/codebase/WE_TRAVEL_ZOHO_ADMIN_SOP.md)
- [Railway deployment runbook](RAILWAY_DEPLOYMENT.md)
- [Architecture decision records](docs/adr/README.md)
