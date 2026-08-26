# Railway Deployment Runbook

Manual steps to perform in the Railway dashboard/CLI. Code-side prerequisites
(bullmq/ioredis in `dependencies`, `engines`, `.env.example`, shared Redis
connection helper) are already committed — see [package.json](package.json)
and [src/services/redis-connection.ts](src/services/redis-connection.ts).

> Note: today the webhook worker runs **in-process** with the web server
> (`webhookWorker` is imported by [src/server.ts](src/server.ts) and closed on
> `SIGTERM`/`SIGINT`). That means **Option A (single service)** below works
> with zero extra code changes. Only follow **Option B (split services)** if
> you want the worker to scale/restart independently of the web process.

---

## 1. Provision the Redis plugin

1. Open the Railway project → **New** → **Database** → **Add Redis**.
2. Once provisioned, open the Redis service → **Variables** tab and note:
   - `REDIS_HOST` (or `RAILWAY_PRIVATE_DOMAIN`)
   - `REDIS_PORT`
   - `REDIS_PASSWORD`
   - Whether the plugin requires TLS (check the connection string — `rediss://` means TLS is required, `redis://` means it is not).
3. Prefer the **private network** hostname (internal, no egress cost) over the public proxy endpoint, since the web/worker service lives in the same Railway project.

## 2. Wire Redis env vars into the app service

1. Go to your app service (the one running `npm start`) → **Variables** tab.
2. Add:
   - `REDIS_HOST` = the private Redis hostname from step 1
   - `REDIS_PORT` = the Redis port from step 1
   - `REDIS_PASSWORD` = the Redis password from step 1
   - `REDIS_TLS` = `true` if step 1 showed `rediss://`, otherwise omit/`false`
3. You can also use Railway's **variable reference** syntax (`${{Redis.REDIS_HOST}}` etc., exact names depend on the plugin's exposed variables — check the Redis service's Variables tab for the reference names) instead of copy-pasting values, so they stay in sync if Railway rotates credentials.
4. Redeploy the app service after adding variables.

## 3. Decide: single service vs. split web/worker

### Option A — Single service (default today, recommended to start)
No changes needed. Railway runs `npm start` (`node dist/server.js`), which
starts the HTTP server and the BullMQ worker in the same process.

Pros: simplest, one service to manage/pay for.
Trade-off: a worker job doing heavy/slow work can compete with the HTTP
event loop, and you can't scale web replicas without also multiplying workers.

### Option B — Split into separate web + worker services
Only do this if you need independent scaling/restarts.

1. Add a dedicated worker entrypoint, e.g. `src/worker-entry.ts`:
   ```ts
   import dotenv from 'dotenv';
   dotenv.config();
   import { webhookWorker } from './services/worker';

   process.on('SIGTERM', async () => { await webhookWorker.close(); process.exit(0); });
   process.on('SIGINT', async () => { await webhookWorker.close(); process.exit(0); });
   ```
2. Remove the `webhookWorker` import/close logic from [src/server.ts](src/server.ts) and [src/app.ts](src/app.ts) so the web process no longer starts a worker.
3. Add a `start:worker` script to [package.json](package.json): `"start:worker": "node dist/worker-entry.js"`.
4. In Railway: **New** → **Empty Service** (or duplicate the existing service), point it at the same repo/branch.
5. Set that new service's **Start Command** to `npm run start:worker` (keep the build command the same, e.g. `npm run build`).
6. Copy over the same Redis + database + integration env vars from the web service (steps 2 and 5) to the worker service's Variables tab.
7. Deploy both services; confirm the worker logs show it connecting to Redis and the web service no longer logs "Webhook Worker Configuration".

## 4. Set real production environment variables/secrets

For each service (web, and worker if split), open **Variables** and set
production values — do **not** reuse local `.env` dummy values. Use
[.env.example](.env.example) as the checklist:

- [ ] `NODE_ENV=production`
- [ ] `PORT` (Railway sets this automatically — don't hardcode)
- [ ] `APP_BASE_URL` / `APP_URL` → your real Railway/custom domain (`https://...`)
- [ ] `SESSION_SECRET` → new random secret (e.g. `openssl rand -hex 32`)
- [ ] `JWT_SECRET` → new random secret
- [ ] `DATABASE_URL` → production Postgres connection string (Railway Postgres plugin or external)
- [ ] `REDIS_HOST` / `REDIS_PORT` / `REDIS_PASSWORD` / `REDIS_TLS` → from step 2
- [ ] `MASTER_KEY` → new random key (do not reuse dev key)
- [ ] `CREDENTIAL_ENCRYPTION_KEY` → new random key (do not reuse dev key)
- [ ] `WEBHOOK_API_KEY` → new production key, shared with whatever calls the webhook API
- [ ] `WE_TRAVEL_WEBHOOK_SECRET` → from the WeTravel production webhook config
- [ ] `VENTRATA_API_KEY` / `VENTRATA_API_URL` → production Ventrata credentials
- [ ] `WETRAVEL_API_BASE_URL` / `WETRAVEL_TOKEN_URL` → production WeTravel endpoints
- [ ] `ZOHO_CLIENT_ID` / `ZOHO_CLIENT_SECRET` / `ZOHO_REFRESH_TOKEN` / `ZOHO_REDIRECT_URI` / `ZOHO_DOMAIN` / `ZOHO_API_DOMAIN` → production Zoho OAuth app
- [ ] Remove/omit dev-only vars (`NGROK_AUTHTOKEN`) from production services

After setting variables, trigger a redeploy and check logs for successful
Redis/Postgres connections and no "using default-dev-key" warnings.
