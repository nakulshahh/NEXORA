# syntax=docker/dockerfile:1
# Build context: the repository root.   docker build -f apps/web/Dockerfile --build-arg API_ORIGIN=https://api.example.com -t nexora-web .
FROM node:22-slim AS build
RUN corepack enable
WORKDIR /repo
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/web/package.json apps/web/
COPY apps/api/package.json apps/api/
COPY packages/content/package.json packages/content/
RUN pnpm install --frozen-lockfile --filter @nexora/web...
COPY apps/web apps/web
COPY packages/content packages/content
# next.config.ts bakes the /api/* proxy target into the build, so it is a build argument, not a runtime variable.
ARG API_ORIGIN=http://api:4000
ENV API_ORIGIN=$API_ORIGIN NEXT_OUTPUT=standalone NEXT_TELEMETRY_DISABLED=1
RUN pnpm --filter @nexora/web build

FROM node:22-slim AS runtime
ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0 NEXT_TELEMETRY_DISABLED=1
WORKDIR /app
# The standalone output already contains the traced node_modules; static assets and public/ are copied beside it.
COPY --from=build --chown=node:node /repo/apps/web/.next/standalone ./
COPY --from=build --chown=node:node /repo/apps/web/.next/static ./apps/web/.next/static
COPY --from=build --chown=node:node /repo/apps/web/public ./apps/web/public
USER node
EXPOSE 3000
HEALTHCHECK --interval=15s --timeout=3s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"
CMD ["node", "apps/web/server.js"]
