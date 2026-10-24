FROM node:22-bookworm-slim AS build

WORKDIR /app
RUN npm install --global pnpm@12.15.0

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/web/package.json ./apps/web/package.json
COPY packages/engine/package.json ./packages/engine/package.json
COPY packages/ui/package.json ./packages/ui/package.json
RUN pnpm install --frozen-lockfile

COPY apps/web ./apps/web
COPY packages/engine ./packages/engine
COPY packages/ui ./packages/ui
COPY content ./content
COPY tsconfig.base.json ./
RUN pnpm --filter @zero-day/web build

FROM caddy:2.8-alpine

COPY infra/web.Caddyfile /etc/caddy/Caddyfile
COPY --from=build /app/apps/web/dist /usr/share/caddy
