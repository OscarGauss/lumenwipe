# syntax=docker/dockerfile:1

# LumenWipe production image for Dokploy.
#
# Multi-stage build:
#   deps    -> install dependencies from the frozen lockfile
#   builder -> compile the Next.js standalone bundle
#   runner  -> minimal runtime that serves the standalone output
#
# NEXT_PUBLIC_* values are inlined into the client bundle at BUILD time, so they
# are passed as build args (see the ARG block below and the Dokploy guide in
# docs/deployment-dokploy.md). Server-only secrets (MEDIATOR_SECRET_*, KV_*,
# PLAYGROUND_*) are read at RUNTIME from the container environment and must NOT
# be passed as build args.

ARG BUN_VERSION=1.3.11

# ─── deps ─────────────────────────────────────────────────────────────────────
FROM oven/bun:${BUN_VERSION} AS deps
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

# ─── builder ──────────────────────────────────────────────────────────────────
FROM oven/bun:${BUN_VERSION} AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Public, build-time configuration. These are safe to expose to the browser.
ARG NEXT_PUBLIC_APP_URL
ARG NEXT_PUBLIC_STELLAR_RPC_MAINNET
ARG NEXT_PUBLIC_STELLAR_RPC_TESTNET
ARG NEXT_PUBLIC_STELLAR_RPC_HEADER_NAME_MAINNET
ARG NEXT_PUBLIC_STELLAR_RPC_HEADER_VALUE_MAINNET
ARG NEXT_PUBLIC_STELLAR_RPC_HEADER_NAME_TESTNET
ARG NEXT_PUBLIC_STELLAR_RPC_HEADER_VALUE_TESTNET
ARG NEXT_PUBLIC_PATH_ROUTING_API_MAINNET
ARG NEXT_PUBLIC_PATH_ROUTING_API_TESTNET
ARG NEXT_PUBLIC_SE_API_BASE_MAINNET
ARG NEXT_PUBLIC_SE_API_BASE_TESTNET
ARG NEXT_PUBLIC_MEDIATOR_PUBLIC_MAINNET
ARG NEXT_PUBLIC_MEDIATOR_PUBLIC_TESTNET

ENV NEXT_PUBLIC_APP_URL=${NEXT_PUBLIC_APP_URL} \
    NEXT_PUBLIC_STELLAR_RPC_MAINNET=${NEXT_PUBLIC_STELLAR_RPC_MAINNET} \
    NEXT_PUBLIC_STELLAR_RPC_TESTNET=${NEXT_PUBLIC_STELLAR_RPC_TESTNET} \
    NEXT_PUBLIC_STELLAR_RPC_HEADER_NAME_MAINNET=${NEXT_PUBLIC_STELLAR_RPC_HEADER_NAME_MAINNET} \
    NEXT_PUBLIC_STELLAR_RPC_HEADER_VALUE_MAINNET=${NEXT_PUBLIC_STELLAR_RPC_HEADER_VALUE_MAINNET} \
    NEXT_PUBLIC_STELLAR_RPC_HEADER_NAME_TESTNET=${NEXT_PUBLIC_STELLAR_RPC_HEADER_NAME_TESTNET} \
    NEXT_PUBLIC_STELLAR_RPC_HEADER_VALUE_TESTNET=${NEXT_PUBLIC_STELLAR_RPC_HEADER_VALUE_TESTNET} \
    NEXT_PUBLIC_PATH_ROUTING_API_MAINNET=${NEXT_PUBLIC_PATH_ROUTING_API_MAINNET} \
    NEXT_PUBLIC_PATH_ROUTING_API_TESTNET=${NEXT_PUBLIC_PATH_ROUTING_API_TESTNET} \
    NEXT_PUBLIC_SE_API_BASE_MAINNET=${NEXT_PUBLIC_SE_API_BASE_MAINNET} \
    NEXT_PUBLIC_SE_API_BASE_TESTNET=${NEXT_PUBLIC_SE_API_BASE_TESTNET} \
    NEXT_PUBLIC_MEDIATOR_PUBLIC_MAINNET=${NEXT_PUBLIC_MEDIATOR_PUBLIC_MAINNET} \
    NEXT_PUBLIC_MEDIATOR_PUBLIC_TESTNET=${NEXT_PUBLIC_MEDIATOR_PUBLIC_TESTNET} \
    NEXT_TELEMETRY_DISABLED=1

RUN bun run build

# ─── runner ───────────────────────────────────────────────────────────────────
FROM oven/bun:${BUN_VERSION} AS runner
WORKDIR /app

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0

# Run as the unprivileged user that ships with the bun image.
USER bun

# Standalone output: server.js + the minimal node_modules it traced, plus the
# static assets and the public/ directory that the server does not bundle.
COPY --from=builder --chown=bun:bun /app/.next/standalone ./
COPY --from=builder --chown=bun:bun /app/.next/static ./.next/static
COPY --from=builder --chown=bun:bun /app/public ./public

EXPOSE 3000

CMD ["bun", "server.js"]
