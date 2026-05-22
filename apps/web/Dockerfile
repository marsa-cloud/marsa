FROM node:22-alpine AS builder
RUN corepack enable

WORKDIR /app

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/

RUN pnpm install --frozen-lockfile

COPY . .

ARG VERSION=0.0.0
ARG COMMIT
ENV NUXT_PUBLIC_VERSION=$VERSION
ENV NUXT_PUBLIC_COMMIT=$COMMIT

RUN pnpm build:web

# ---------------------------------------------------------------

FROM nginx:alpine AS runner

COPY --from=builder /app/apps/web/.output/public /usr/share/nginx/html
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
