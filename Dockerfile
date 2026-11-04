FROM node:24.20.0-bookworm-slim AS dependencies
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts

FROM dependencies AS builder
COPY . .
RUN npm run build

# Explicit operational image; never starts migrations as part of a web rollout.
FROM builder AS operations
ENV NODE_ENV=production
USER node
CMD ["node", "scripts/check-production-env.mjs"]

FROM node:24.20.0-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
COPY --from=builder --chown=node:node /app/.next/standalone ./
COPY --chown=node:node scripts/check-production-env.mjs scripts/start-production.mjs ./scripts/
USER node
EXPOSE 3000
CMD ["node", "scripts/start-production.mjs"]
