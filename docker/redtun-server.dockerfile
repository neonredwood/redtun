# syntax=docker/dockerfile:1.4
FROM node:20-alpine AS pnpm
RUN npm install -g pnpm turbo

FROM pnpm AS workspace
WORKDIR /app
COPY package*.json ./
COPY pnpm*.yaml ./
COPY ./packages/redtun/package.json ./packages/redtun/package.json
COPY ./packages/redtun-common/package.json ./packages/redtun-common/package.json
COPY ./packages/redtun-server/package.json ./packages/redtun-server/package.json
RUN pnpm install
COPY . .
RUN turbo build:dist  --filter @neonredwood/redtun-server

FROM workspace AS pruned
RUN pnpm --filter @neonredwood/redtun-server --prod deploy pruned

FROM node:20-alpine
WORKDIR /app

ENV NODE_ENV=production
EXPOSE 3000
ENV PORT 3000
COPY --from=pruned /app/pruned .

ENTRYPOINT ["node", "dist/server.bundle.js"]
