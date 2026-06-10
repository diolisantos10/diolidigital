# Deployment & Production QA

This app deploys as a **Next.js standalone server**. The production artifact is what
Railway (or any Node host) runs via the `start` script:

```bash
npm run build      # produces .next/standalone (server + static + public)
npm run start      # HOSTNAME=0.0.0.0 PORT=${PORT:-8080} node .next/standalone/server.js
```

## Production URL

> **TBD — fill in after the first Railway deploy.**
>
> ```
> PRODUCTION_URL = https://<your-app>.up.railway.app
> ```
>
> As of the last QA pass this URL was **not yet configured/discoverable** from the
> build environment (no Railway CLI, token, or project linkage present). Once the
> service is deployed and a public domain is generated, record it here so future QA
> can target it without guessing.

### How to deploy on Railway and get the domain

```bash
# one-time
railway login
railway link            # select/create the project

# deploy
railway up

# generate a public domain (if none exists yet)
railway domain          # prints https://<app>.up.railway.app  -> paste it above
```

Railway auto-runs `npm run build` then `npm run start`; the app binds to `$PORT`.

## Required Railway Variables

| Variable | Required | Purpose |
|---|---|---|
| `AUTH_SECRET` | **Yes** | JWT signing key. Generate: `openssl rand -base64 32`. Auth fails loudly (HTTP 500 with message) if missing in production. |
| `DATABASE_URL` | **Yes** | Prisma connection string. |
| `CRON_SECRET` | For 24h training | Bearer token protecting `/api/cron/training/sdr`. Endpoint returns 503 if unset. Generate: `openssl rand -base64 32`. |
| `TRAINING_ENABLED` | For 24h training | Set `true` to activate the backend training worker. Default: `false` (safe). |
| `TRAINING_BATCH_SIZE` | Optional | Runs per cron batch (default `10`). Cron executes 1× dynamic batch + 1× mixed half-batch per trigger. |
| `TRAINING_DAILY_CAP` | Optional | Max persisted runs per day (default `200`). Enforced server-side in every batch — cron and manual. |
| `AUTH_DEBUG` | Optional | `true` enables per-request `[PROXY]` auth logs. |

## 24h Training Worker — cron setup

The worker is a protected HTTP endpoint; any scheduler can trigger it.

**Endpoint:**
```
POST https://<your-app>.up.railway.app/api/cron/training/sdr
Authorization: Bearer <CRON_SECRET>
```

**Recommended frequency:** every 1 hour.

**Per trigger it runs** `TRAINING_BATCH_SIZE` dynamic + half that mixed
(default 10 + 5 = 15 runs), persisting TrainingBatch, DbSimulationRun,
DbAgentSuggestion and TrainingAlert rows. The daily cap is re-checked before
each batch; once `TRAINING_DAILY_CAP` is hit the endpoint returns
`capReached: true` and runs nothing.

**Option A — Railway cron service (recommended):** add a second Railway
service in the same project with a cron schedule `0 * * * *` and command:

```bash
curl -fsS -X POST "$APP_URL/api/cron/training/sdr" \
  -H "Authorization: Bearer $CRON_SECRET"
```

**Option B — external scheduler** (GitHub Actions schedule, cron-job.org,
UptimeRobot heartbeat): same POST request, same header.

**Safety responses:**
- `CRON_SECRET` unset → 503 (never runs unsecured)
- wrong/missing Bearer token → 401
- `TRAINING_ENABLED` ≠ `true` → 200 with `ran: false` (no-op)
- daily cap reached → 200 with `capReached: true`, zero runs

## Running the pilot smoke test against production

The Playwright smoke scripts default to a local server but accept an override:

```bash
SMOKE_BASE="https://<your-app>.up.railway.app" node /tmp/pw-verify/prod-smoke.cjs   # core flow
SMOKE_BASE="https://<your-app>.up.railway.app" node /tmp/pw-verify/prod-exec.cjs    # agent execution + reporting
```

Both reset the persisted store (`localStorage 'agency-os-v1'`) back to factory mock
data before running, so the **Dioli Digital** pilot (client `c4`, project `p7`) is
always present.

## Last validated (production build artifact, standalone server)

Validated locally against `node .next/standalone/server.js` — the exact command
Railway runs. Full Dioli Digital pilot path: **15/15 checks green**
(app load, no hydration warnings, client + project seed, Command Center, Strategy
Room V2, pricing guard, send, portal, approval, Social/Design/Ads agents executing
and saving deliverables, Reporting tab). TypeScript clean; `next build` passes.
