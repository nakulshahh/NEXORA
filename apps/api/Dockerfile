# syntax=docker/dockerfile:1
# Build context: the repository root.   docker build -f apps/api/Dockerfile -t nexora-api .
FROM node:26-slim AS build
RUN corepack enable
WORKDIR /repo
# Manifests first: this layer (and the install) is cached until a dependency actually changes.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/content/package.json packages/content/
RUN pnpm install --frozen-lockfile --filter @nexora/api...
COPY apps/api apps/api
RUN pnpm --filter @nexora/api build \
 && pnpm --filter @nexora/api deploy --legacy --prod /out      # production dependencies + dist + drizzle migrations only

FROM node:26-slim AS runtime
ENV NODE_ENV=production PORT=4000
WORKDIR /app
COPY --from=build --chown=node:node /out /app
USER node
EXPOSE 4000
# No curl in slim images; Node can probe itself. /healthz never touches the database (a DB blip must not restart us).
HEALTHCHECK --interval=15s --timeout=3s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/healthz').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"
# `node` as PID 1 receives SIGTERM directly (no shell wrapper), so the graceful shutdown in server.ts runs.
CMD ["node", "dist/server.js"]
