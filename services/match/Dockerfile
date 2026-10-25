FROM node:22-bookworm-slim

WORKDIR /app
RUN npm install --global pnpm@12.15.0

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY services/match/package.json ./services/match/package.json
COPY packages/engine/package.json ./packages/engine/package.json
RUN pnpm install --frozen-lockfile

COPY services/match ./services/match
COPY packages/engine ./packages/engine
COPY content ./content

EXPOSE 8090
CMD ["node", "--experimental-strip-types", "services/match/src/server.ts"]
