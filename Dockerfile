# SPDX-License-Identifier: Apache-2.0

# ============================================
# Res ex Machina — Dockerfile
# Single package manager: pnpm workspace (packageManager in package.json).
# ============================================

FROM node:22-alpine AS base
WORKDIR /app
RUN corepack enable

# --- Stage: deps (all workspace dependencies, from the lockfile) ---
FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/pog/package.json packages/pog/
COPY packages/sdk/package.json packages/sdk/
COPY packages/mcp-server/package.json packages/mcp-server/
RUN pnpm install --frozen-lockfile --filter . --filter @res-ex-machina/pog

# --- Stage: development (docker-compose) ---
FROM deps AS development
COPY . .
RUN pnpm --filter @res-ex-machina/pog build
CMD ["pnpm", "run", "dev"]

# --- Stage: build ---
FROM deps AS build
COPY . .
RUN pnpm --filter @res-ex-machina/pog build && pnpm run build

# --- Stage: production ---
FROM base AS production
ENV NODE_ENV=production
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/pog/package.json packages/pog/
COPY packages/sdk/package.json packages/sdk/
COPY packages/mcp-server/package.json packages/mcp-server/
RUN pnpm install --frozen-lockfile --prod --filter . --filter @res-ex-machina/pog && pnpm store prune
COPY --from=build /app/dist ./dist
COPY --from=build /app/packages/pog/dist ./packages/pog/dist

# Security: run as non-root user (node user exists in alpine images)
USER node

EXPOSE 3000
CMD ["node", "dist/app.js"]
