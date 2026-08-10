# syntax=docker/dockerfile:1.7
# Official mutable multi-architecture tag; Dependabot tracks Docker updates.
ARG NODE_VERSION=24.19.0
FROM node:${NODE_VERSION}-bookworm-slim AS dependencies
WORKDIR /app
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci

FROM dependencies AS build
COPY tsconfig.json tsconfig.build.json ./
COPY src ./src
RUN npm run build

FROM node:${NODE_VERSION}-bookworm-slim AS production-dependencies
WORKDIR /app
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci --omit=dev && npm cache clean --force

FROM node:${NODE_VERSION}-bookworm-slim AS runtime
ARG VERSION=dev
ARG REVISION=unknown
ARG CREATED=unknown
LABEL org.opencontainers.image.title="ScheduleBot" \
      org.opencontainers.image.description="Self-hosted Discord event scheduling bot" \
      org.opencontainers.image.version="${VERSION}" \
      org.opencontainers.image.revision="${REVISION}" \
      org.opencontainers.image.created="${CREATED}" \
      org.opencontainers.image.source="https://github.com/Duinrahaic/ScheduleBot" \
      org.opencontainers.image.licenses="MIT"
ENV NODE_ENV=production HEALTH_PORT=3000 SQLITE_FILE=/app/data/schedulebot.sqlite3
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends dumb-init && rm -rf /var/lib/apt/lists/* && mkdir -p /app/data && chown node:node /app/data
COPY --from=production-dependencies --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
COPY --chown=node:node package.json ./
USER node
EXPOSE 3000
VOLUME ["/app/data"]
HEALTHCHECK --interval=30s --timeout=3s --start-period=20s --retries=3 CMD ["node", "-e", "const port=process.env.HEALTH_PORT||3000;require('http').get(`http://127.0.0.1:${port}/health`,r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"]
ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "dist/index.js"]
