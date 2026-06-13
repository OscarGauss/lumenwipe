# syntax=docker/dockerfile:1.7
# Multi-stage build for LumenWipe (Next.js 15 + Bun), tuned for Dokploy.
#
# Env split (see .env.dokploy.example):
#   - Build-time Arguments  -> ARG/ENV below, baked into the client bundle (NEXT_PUBLIC_*).
#   - Build-time Secrets     -> RUN --mount=type=secret (none required today; pattern shown).
#   - Environment Settings   -> NOT here; injected by Dokploy at container runtime.

# ---- deps: install with the locked Bun version ----
FROM oven/bun:1.3.11 AS deps
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

# ---- builder: compile the Next.js app ----
FROM oven/bun:1.3.11 AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Build-time Arguments (Dokploy passes these as --build-arg).
# Every NEXT_PUBLIC_* is inlined into the client bundle by `next build`,
# so it MUST be present here, not just at runtime. All public by design.
ARG NEXT_PUBLIC_APP_URL
ARG NEXT_PUBLIC_STELLAR_RPC_MAINNET
ARG NEXT_PUBLIC_STELLAR_RPC_TESTNET
ARG NEXT_PUBLIC_PATH_ROUTING_API_MAINNET
ARG NEXT_PUBLIC_PATH_ROUTING_API_TESTNET
ARG NEXT_PUBLIC_MEDIATOR_PUBLIC_MAINNET
ARG NEXT_PUBLIC_MEDIATOR_PUBLIC_TESTNET
# Optional (have safe defaults in config/networks.ts or are feature-gated):
ARG NEXT_PUBLIC_STELLAR_RPC_HEADER_NAME_MAINNET
ARG NEXT_PUBLIC_STELLAR_RPC_HEADER_VALUE_MAINNET
ARG NEXT_PUBLIC_STELLAR_RPC_HEADER_NAME_TESTNET
ARG NEXT_PUBLIC_STELLAR_RPC_HEADER_VALUE_TESTNET
ARG NEXT_PUBLIC_SE_API_BASE_MAINNET
ARG NEXT_PUBLIC_SE_API_BASE_TESTNET
ARG NEXT_PUBLIC_UMAMI_WEBSITE_ID

ENV NEXT_PUBLIC_APP_URL=$NEXT_PUBLIC_APP_URL \
    NEXT_PUBLIC_STELLAR_RPC_MAINNET=$NEXT_PUBLIC_STELLAR_RPC_MAINNET \
    NEXT_PUBLIC_STELLAR_RPC_TESTNET=$NEXT_PUBLIC_STELLAR_RPC_TESTNET \
    NEXT_PUBLIC_PATH_ROUTING_API_MAINNET=$NEXT_PUBLIC_PATH_ROUTING_API_MAINNET \
    NEXT_PUBLIC_PATH_ROUTING_API_TESTNET=$NEXT_PUBLIC_PATH_ROUTING_API_TESTNET \
    NEXT_PUBLIC_MEDIATOR_PUBLIC_MAINNET=$NEXT_PUBLIC_MEDIATOR_PUBLIC_MAINNET \
    NEXT_PUBLIC_MEDIATOR_PUBLIC_TESTNET=$NEXT_PUBLIC_MEDIATOR_PUBLIC_TESTNET \
    NEXT_PUBLIC_STELLAR_RPC_HEADER_NAME_MAINNET=$NEXT_PUBLIC_STELLAR_RPC_HEADER_NAME_MAINNET \
    NEXT_PUBLIC_STELLAR_RPC_HEADER_VALUE_MAINNET=$NEXT_PUBLIC_STELLAR_RPC_HEADER_VALUE_MAINNET \
    NEXT_PUBLIC_STELLAR_RPC_HEADER_NAME_TESTNET=$NEXT_PUBLIC_STELLAR_RPC_HEADER_NAME_TESTNET \
    NEXT_PUBLIC_STELLAR_RPC_HEADER_VALUE_TESTNET=$NEXT_PUBLIC_STELLAR_RPC_HEADER_VALUE_TESTNET \
    NEXT_PUBLIC_SE_API_BASE_MAINNET=$NEXT_PUBLIC_SE_API_BASE_MAINNET \
    NEXT_PUBLIC_SE_API_BASE_TESTNET=$NEXT_PUBLIC_SE_API_BASE_TESTNET \
    NEXT_PUBLIC_UMAMI_WEBSITE_ID=$NEXT_PUBLIC_UMAMI_WEBSITE_ID \
    NEXT_TELEMETRY_DISABLED=1

# Build-time Secrets (Dokploy "Build-time Secrets" -> BuildKit secrets).
# None required: everything sensitive in this app is read at runtime on the
# server, and everything needed at build is NEXT_PUBLIC_ (public). If you ever
# need a sensitive value ONLY during the build (e.g. a private npm token), add
# it as a Dokploy build secret and consume it without baking it into a layer:
#
#   RUN --mount=type=secret,id=NPM_TOKEN \
#       NPM_TOKEN="$(cat /run/secrets/NPM_TOKEN)" bun run build
#
# Otherwise the plain build is enough:
RUN bun run build

# ---- runner: minimal runtime image ----
FROM oven/bun:1.3.11 AS runner
WORKDIR /app
ENV NODE_ENV=production \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    NEXT_TELEMETRY_DISABLED=1

# next.config.mjs has no `output: standalone`, so ship .next + node_modules.
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/public ./public
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/next.config.mjs ./next.config.mjs

EXPOSE 3000
CMD ["bun", "run", "start"]