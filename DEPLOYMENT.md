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
