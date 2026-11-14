# syntax=docker/dockerfile:1
#
# All-in-one production image for MarvelSoftware ERP.
#
# One container = nginx (SPA + reverse proxy) + Node API. That keeps the host
# surface small: the container listens on :8080 internally, docker-compose
# publishes it on 127.0.0.1 only, and Apache/Webuzo owns the public 80/443.
#
#   Internet -> Apache/Webuzo :443 -> 127.0.0.1:8086 -> this image (:8080)
#                                                       |- nginx -> SPA files
#                                                       `- /api  -> :4000 Node
#                                                                    -> Supabase
#
# Build context MUST be the repo root (npm workspaces + package-lock.json):
#   docker build -t marvel-software/erp .
#
# The two-image split stack is still available via docker-compose.split.yml.

# ---------------------------------------------------------------------------
# 1) Build the Vite SPA (needs devDependencies: tsc + vite)
# ---------------------------------------------------------------------------
FROM node:22-alpine AS web-build
WORKDIR /app

# Manifests first so `npm ci` is cached until a manifest/lockfile changes.
# Every workspace manifest must be present or npm ci rejects the lockfile.
COPY package.json package-lock.json ./
COPY apps/web/package.json ./apps/web/package.json
COPY server/package.json ./server/package.json
COPY packages/types/package.json ./packages/types/package.json
COPY packages/validation/package.json ./packages/validation/package.json
RUN npm ci

COPY apps/web ./apps/web
COPY packages ./packages

# VITE_API_URL is deliberately unset: the SPA calls the relative "/api" and
# rides through the in-container nginx proxy. Never bake a hostname in.
RUN npm run build -w web

# ---------------------------------------------------------------------------
# 2) Production Node dependencies
# ---------------------------------------------------------------------------
FROM node:22-alpine AS api-deps
WORKDIR /app

COPY package.json package-lock.json ./
COPY apps/web/package.json ./apps/web/package.json
COPY server/package.json ./server/package.json
COPY packages/types/package.json ./packages/types/package.json
COPY packages/validation/package.json ./packages/validation/package.json

# No native addons (bcryptjs/pg/nodemailer are pure JS), so no compiler needed.
RUN npm ci --omit=dev

# ---------------------------------------------------------------------------
# 3) Runtime: Node API + nginx, supervised in one container
# ---------------------------------------------------------------------------
FROM node:22-alpine AS runtime

RUN apk add --no-cache nginx supervisor tzdata \
 && mkdir -p /run/nginx /var/lib/nginx/tmp /var/log/nginx /usr/share/nginx/html \
 && chown -R nginx:nginx /run/nginx /var/lib/nginx /var/log/nginx

ENV NODE_ENV=production \
    PORT=4000 \
    TZ=Asia/Kolkata

WORKDIR /app

# In-container nginx: listen 8080, serve SPA, proxy /api -> 127.0.0.1:4000.
COPY docker/nginx.conf /etc/nginx/http.d/default.conf
# supervisord keeps both processes alive and forwards their logs to docker logs.
COPY docker/supervisord.conf /etc/supervisord.conf

# Runtime layout:
#   - supabase/migrations is read at boot by server/src/db.js
#   - packages/ keeps the npm workspace symlinks valid
COPY --from=api-deps --chown=node:node /app/node_modules ./node_modules
COPY --chown=node:node server ./server
COPY --chown=node:node packages ./packages
COPY --chown=node:node supabase ./supabase
COPY --from=web-build --chown=nginx:nginx /app/apps/web/dist /usr/share/nginx/html

# Internal only. The host publication is configured in docker-compose.yml.
EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=5 \
  CMD wget -qO- http://127.0.0.1:8080/api/health >/dev/null 2>&1 || exit 1

CMD ["supervisord", "-c", "/etc/supervisord.conf"]
