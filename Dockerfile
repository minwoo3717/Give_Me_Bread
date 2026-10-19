# syntax=docker/dockerfile:1.7
#
# Production image for ECS Fargate (linux/arm64 by default, built in CI).
#   docker build --build-arg NEXT_DEPLOYMENT_ID=$(git rev-parse --short HEAD) -t oven-note .
#
# Stages: deps (pnpm install) -> build (next build + ops scripts) -> runner.

ARG NODE_IMAGE=node:24.22.0-alpine3.24

FROM ${NODE_IMAGE} AS base
ENV PNPM_HOME=/pnpm \
    PATH=/pnpm:$PATH \
    NEXT_TELEMETRY_DISABLED=1
# Node 24 still ships corepack; it installs the pnpm version pinned in
# package.json ("packageManager").
RUN corepack enable pnpm
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile

FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Git SHA of the commit being built: version-skew protection + /api/health.
ARG NEXT_DEPLOYMENT_ID=dev
ENV NEXT_DEPLOYMENT_ID=${NEXT_DEPLOYMENT_ID}
# Optional build secret: a stable NEXT_SERVER_ACTIONS_ENCRYPTION_KEY keeps
# Server Action IDs identical across builds, so an admin form loaded before a
# deploy still submits after it. Passed as a BuildKit secret, never a layer.
RUN --mount=type=secret,id=next_server_actions_key,required=false \
    mkdir -p public && \
    if [ -s /run/secrets/next_server_actions_key ]; then \
      export NEXT_SERVER_ACTIONS_ENCRYPTION_KEY="$(cat /run/secrets/next_server_actions_key)"; \
    fi && \
    pnpm build && pnpm build:scripts

FROM ${NODE_IMAGE} AS runner
WORKDIR /app
ARG NEXT_DEPLOYMENT_ID=dev
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    NEXT_DEPLOYMENT_ID=${NEXT_DEPLOYMENT_ID} \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    # Longer than the ALB idle timeout (60s) so the ALB, not Node, closes
    # idle keep-alive connections; avoids sporadic 502s.
    KEEP_ALIVE_TIMEOUT=65000 \
    MIGRATIONS_DIR=/app/drizzle \
    DB_SSL_CA_PATH=/app/certs/rds-global-bundle.pem

# Next.js server (standalone output) and the assets it serves itself.
COPY --from=build --chown=node:node /app/.next/standalone ./
# Entry wrapper: forces the bind address and no-store on 3xx/5xx responses.
COPY --from=build --chown=node:node /app/server-entry.cjs ./server-entry.cjs
COPY --from=build --chown=node:node /app/.next/static ./.next/static
COPY --from=build --chown=node:node /app/public ./public
# Ops scripts (bundled) and SQL migrations, run as one-off ECS tasks.
COPY --from=build --chown=node:node /app/dist/scripts ./scripts
COPY --from=build --chown=node:node /app/drizzle ./drizzle
# CA bundle so connections to RDS verify the server certificate.
ADD --chown=node:node https://truststore.pki.rds.amazonaws.com/global/global-bundle.pem ./certs/rds-global-bundle.pem

USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server-entry.cjs"]
