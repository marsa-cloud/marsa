FROM node:24.15.0-alpine AS builder
RUN corepack enable

WORKDIR /app

# Copy workspace manifest first for better layer caching
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/

RUN pnpm install --frozen-lockfile

# Copy source (after install so the install layer is cached on source-only changes)
COPY . .

RUN pnpm build:api

# ---------------------------------------------------------------

FROM node:24.15.0-alpine AS runner
RUN corepack enable

WORKDIR /app

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/

RUN pnpm install --frozen-lockfile --prod

COPY --from=builder /app/apps/api/dist apps/api/dist

WORKDIR /app/apps/api

ARG VERSION=0.0.0
ARG COMMIT
ENV NODE_ENV=production
ENV VERSION=$VERSION
ENV COMMIT=$COMMIT
EXPOSE 3000

USER node

CMD ["node", "dist/src/entrypoints/api.js"]
