FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build
FROM node:22-bookworm-slim AS runtime
RUN apt-get update && apt-get install -y --no-install-recommends chromium fonts-liberation && rm -rf /var/lib/apt/lists/*
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 HOSTNAME=0.0.0.0 PORT=3000
COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static
COPY --from=build --chown=node:node /app/public ./public
COPY --chown=node:node scripts/bootstrap-admin.mjs ./scripts/bootstrap-admin.mjs
COPY --chown=node:node src/infrastructure/entity-store.ts ./src/infrastructure/entity-store.ts
COPY --chown=node:node src/domain/model.ts ./src/domain/model.ts
COPY --chown=node:node scripts/migrate-data.mjs ./scripts/migrate-data.mjs
RUN mkdir -p /app/storage/photos /run/crm-pdf && chown -R node:node /app/storage /run/crm-pdf
USER node
EXPOSE 3000
CMD ["node","server.js"]

FROM runtime AS pdf
COPY --chown=node:node services/pdf/server.mjs /app/pdf-server.mjs
CMD ["node","pdf-server.mjs"]

FROM runtime AS app
CMD ["node","server.js"]
