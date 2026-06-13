# Deploying LumenWipe on Dokploy

LumenWipe is a Next.js 15 app. This repo ships a production `Dockerfile`
(multi-stage, Bun-based, `output: "standalone"`) so Dokploy can build and run it
directly. The backend is read-only and never holds funds, but it still needs the
correct environment to talk to Stellar RPC and (optionally) the mediator/stats
services.

> **Build-time vs runtime split — read this first.**
> `NEXT_PUBLIC_*` values are **inlined into the browser bundle at build time**,
> so they must be supplied as **build arguments**. Server-only secrets
> (`MEDIATOR_SECRET_*`, `KV_REST_API_*`, `PLAYGROUND_*`) are read **at runtime**
> from the container environment and must **never** be passed as build args or
> prefixed with `NEXT_PUBLIC_`.

---

## 1. Create the application in Dokploy

1. In your Dokploy project, **Create Service → Application**.
2. **Provider:** GitHub (or Git). Point it at this repository and the branch you
   deploy from.
3. **Build Type:** select **Dockerfile**. Leave the Dockerfile path as the
   default `./Dockerfile`.

## 2. Build arguments (the `NEXT_PUBLIC_*` values)

Open the application's **Build** settings and add these as **Build-time
Arguments**. At minimum you need the two RPC endpoints and the app URL; the rest
are optional depending on which features you enable.

| Build arg | Required | Example / notes |
|---|---|---|
| `NEXT_PUBLIC_APP_URL` | yes | `https://lumenwipe.yourdomain.com` (sitemap/robots/SEO) |
| `NEXT_PUBLIC_STELLAR_RPC_MAINNET` | yes* | Your mainnet RPC provider URL |
| `NEXT_PUBLIC_STELLAR_RPC_TESTNET` | yes | `https://soroban-testnet.stellar.org` |
| `NEXT_PUBLIC_STELLAR_RPC_HEADER_NAME_MAINNET` | no | Auth header name if your provider needs one |
| `NEXT_PUBLIC_STELLAR_RPC_HEADER_VALUE_MAINNET` | no | Auth header value (public — visible in the client) |
| `NEXT_PUBLIC_STELLAR_RPC_HEADER_NAME_TESTNET` | no | |
| `NEXT_PUBLIC_STELLAR_RPC_HEADER_VALUE_TESTNET` | no | |
| `NEXT_PUBLIC_PATH_ROUTING_API_MAINNET` | no | Soroswap/path-routing API base |
| `NEXT_PUBLIC_PATH_ROUTING_API_TESTNET` | no | |
| `NEXT_PUBLIC_SE_API_BASE_MAINNET` | no | Override only for testing |
| `NEXT_PUBLIC_SE_API_BASE_TESTNET` | no | Override only for testing |
| `NEXT_PUBLIC_MEDIATOR_PUBLIC_MAINNET` | no | Public key of the funded mediator account |
| `NEXT_PUBLIC_MEDIATOR_PUBLIC_TESTNET` | no | |

\* Only required if you serve the mainnet tool. A testnet-only deployment can
leave the mainnet values empty.

> Any RPC header **value** marked `NEXT_PUBLIC_*` is exposed to the browser. If
> your provider's key must stay secret, front it with a proxy rather than putting
> it here.

## 3. Runtime environment variables (secrets)

Open **Environment** settings and add these as regular environment variables
(NOT build args). All are optional and only needed for the corresponding
feature:

```dotenv
# Mediator (merges to exchanges that don't support ACCOUNT_MERGE) — SECRET
MEDIATOR_SECRET_MAINNET=
MEDIATOR_SECRET_TESTNET=

# Vercel KV / Redis — only for the merge stats counter (lib/kv.ts)
KV_REST_API_URL=
KV_REST_API_TOKEN=

# Testnet playground — SECRET
PLAYGROUND_ISSUER_SECRET_TESTNET=
PLAYGROUND_MM_SECRET_TESTNET=
PLAYGROUND_ENCRYPTION_KEY=
```

If you don't use the mediator, stats, or playground features, you can omit all
of these and the app still runs.

## 4. Networking / domain

- The container listens on **port 3000** (`PORT`/`HOSTNAME` are already set in
  the Dockerfile to `3000` / `0.0.0.0`).
- In Dokploy's **Domains** tab, add your domain and set the **container port to
  `3000`**. Enable HTTPS (Let's Encrypt) there.

## 5. Health check

The app exposes `GET /api/health`. Note it is a **deep** check: it pings Stellar
RPC and stellar.expert and returns **503** if any upstream is unreachable. That
makes it great for monitoring but a poor liveness probe — a transient RPC outage
would flap your container. For Dokploy's container health check, prefer the root
path `/` (always 200 when the server is up), and use `/api/health` for external
uptime monitoring.

## 6. Deploy

Click **Deploy**. Dokploy builds the image from the `Dockerfile` and starts the
container. First build installs dependencies and compiles the standalone bundle
(a few minutes); subsequent builds reuse Docker layer cache.

---

## Alternative: Docker Compose deployment

If you prefer Dokploy's **Compose** service type, a `docker-compose.yml` is
included. Dokploy substitutes its project environment variables into the compose
file, so you can define every value once in **Environment** and it flows to both
`build.args` (the `NEXT_PUBLIC_*` set) and the runtime `environment` block. See
the comments in `docker-compose.yml`.

## Troubleshooting

- **Client shows the wrong RPC / app URL:** `NEXT_PUBLIC_*` is baked at build
  time. Changing it in **Environment** does nothing — update the **Build args**
  and redeploy so the bundle is recompiled.
- **`bun install --frozen-lockfile` fails:** `bun.lock` is out of sync with
  `package.json`. Run `bun install` locally and commit the updated lockfile.
- **Mediator / exchange merges fail:** the `MEDIATOR_SECRET_*` (runtime) and
  matching `NEXT_PUBLIC_MEDIATOR_PUBLIC_*` (build arg) must both be set, and the
  mediator account must be funded on-chain.
