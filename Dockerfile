# The DevNet Control API.
#
# This image contains only this repository's code (MIT). Blockscout is not in it
# and never will be — its licence forbids redistributing derivative works, so the
# explorer UI is built on your machine by stack/Dockerfile.explorer instead.
#
# Anvil is included so the API can start nodes itself, and the Docker CLI so the
# explorer auto-sync can reconfigure the Blockscout stack. Both are optional at
# runtime: point the API at a node on the host and it never spawns one.

# ── dependencies ─────────────────────────────────────────────────────────────
FROM oven/bun:1.3 AS deps
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

# ── build ────────────────────────────────────────────────────────────────────
# Built with Node, not Bun: persistence uses node:sqlite, which Bun does not
# implement, and `next build` evaluates the route modules.
FROM node:22-slim AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN node_modules/.bin/next build

# ── runtime ──────────────────────────────────────────────────────────────────
# Debian rather than Alpine: Foundry's official binaries are built against glibc.
FROM node:22-slim AS runtime
WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends curl lsof ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Straight from the publishers, so nothing here is a rebuild of someone else's tool.
COPY --from=ghcr.io/foundry-rs/foundry:latest /usr/local/bin/anvil /usr/local/bin/anvil
COPY --from=ghcr.io/foundry-rs/foundry:latest /usr/local/bin/cast /usr/local/bin/cast
COPY --from=docker:27-cli /usr/local/bin/docker /usr/local/bin/docker
COPY --from=docker:27-cli /usr/local/libexec/docker/cli-plugins /usr/local/libexec/docker/cli-plugins

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    DEVNET_API_PORT=3010 \
    DEVNET_DB_PATH=/data/devnet.db \
    HOSTNAME=0.0.0.0

COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public

# The SQLite file and Anvil's state dumps belong on a volume, not in the layer.
RUN mkdir -p /data
VOLUME /data
EXPOSE 3010

HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=5 \
  CMD curl -fsS "http://127.0.0.1:${DEVNET_API_PORT}/api/anvil/status" || exit 1

CMD ["sh", "-c", "PORT=${DEVNET_API_PORT} node server.js"]
