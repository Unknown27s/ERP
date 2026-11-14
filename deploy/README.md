# Deploy (Docker + Apache/Webuzo)

One all-in-one image runs the SPA and the API. **Apache (Webuzo)** on the host
owns ports 80/443 and TLS; it reverse-proxies to a single loopback-only port.

```
Internet ─▶ Apache / Webuzo (erp.example.com, TLS 80/443)
              └─▶ 127.0.0.1:8086
                     └─▶ erp container
                           ├─ nginx :8080  (SPA + /api proxy)
                           └─ Node API :4000 ─▶ Supabase Cloud (Postgres)
```

The app is stateless — the only durable store is Postgres — so containers are
disposable and `docker compose up -d --build` is a full deploy.

## Files

| File | Purpose |
| --- | --- |
| `Dockerfile` | All-in-one image: builds the Vite SPA, installs API deps, runs nginx + Node under supervisord |
| `docker/nginx.conf` | In-container nginx: SPA fallback + `/api` proxy to `127.0.0.1:4000` |
| `docker/supervisord.conf` | Runs and supervises the API and nginx processes |
| `docker-compose.yml` | Default stack: one `erp` service on `erp_net`, port 8086 |
| `docker-compose.split.yml` | Alternative two-image stack (`erp-api` + `erp-web`), port 8086 |
| `deploy/apache/subdomain-vhost.conf` | Webuzo vhost proxy block (**recommended**) |
| `deploy/apache/subdomain.htaccess` | `.htaccess` fallback proxy |
| `deploy/apache/README.md` | Webuzo/Apache install + port map |
| `.dockerignore` | Keeps the build context lean and secrets out |

The original per-service images remain available via `server/Dockerfile` and
`apps/web/Dockerfile`; they are only used by the split stack.

## Ports and networks

Other projects on this server already use 80/443, 8080-8085, 8000/8443 and
9000. This stack stays clear of them on 8086:

| Stack | Docker network | Loopback port |
| --- | --- | --- |
| All-in-one (default) | `erp_net` | **8086** (`ERP_PORT`) |
| Split (optional) | `erp_split_net` | **8086** (`ERP_WEB_PORT`) |

Every co-hosted application must use:

1. its own compose project name;
2. its own bridge network name (e.g. `erp_net`, `lms_net`, `crm_net`);
3. its own loopback-only port from `8086-8099`.

Docker publishes on `127.0.0.1` only, so the port is never reachable from the
internet — Apache is the sole entry point. Check a port before using it:

```bash
ss -tlnp | grep -E '808[6-9]|809[0-9]'
docker ps --format 'table {{.Names}}\t{{.Ports}}'
```

## One-time server setup

1. **DNS:** `A` record for the ERP domain (e.g. `erp.example.com`) → VPS IP.
2. **Webuzo:** create the domain/subdomain and enable SSL (Let's Encrypt).
3. **Env file** next to `docker-compose.yml` (git-ignored, excluded from image):

   ```bash
   cp .env.example .env
   $EDITOR .env
   ```

   Set `DATABASE_URL` to the **Supabase Session pooler** string
   (Project Settings → Database → Connection string → Session pooler):

   ```env
   DATABASE_URL=postgresql://postgres.<project-ref>:<db-password>@aws-0-<region>.pooler.supabase.com:5432/postgres
   ```

   Why the pooler: the direct host (`db.<project-ref>.supabase.co`) is IPv6-only,
   and many VPSes have no IPv6. The pooler is IPv4. The username is
   `postgres.<project-ref>` and the port is **5432** (Session mode), not 6543.
   Also set a new `JWT_SECRET` (32+ random chars) and the `SMTP_*` values.

   **Existing Supabase project?** The migrations create tables in the `public`
   schema (`shops`, `products`, `categories`, `profiles`, …). If another app uses
   those names, use a separate project or a dedicated schema.

4. **Build and start:**

   ```bash
   docker compose up -d --build
   docker compose ps
   docker compose logs -f erp
   ```

5. **Schema + demo data once** (the API also runs migrations on boot):

   ```bash
   docker compose run --rm erp node server/src/migrate.js
   docker compose run --rm erp node server/src/seed.js
   ```

6. **Apache:** add the proxy block from `deploy/apache/subdomain-vhost.conf`
   inside the domain's `:443` vhost (and `:80` if it is not redirecting), then:

   ```bash
   /usr/local/apps/apache/bin/apachectl configtest
   /usr/local/apps/apache/bin/apachectl graceful
   ```

   On SELinux hosts, allow Apache to reach the loopback port:

   ```bash
   setsebool -P httpd_can_network_connect 1
   ```

   Full Webuzo steps: `deploy/apache/README.md`.

## Environment and secrets

Configuration is injected at **runtime**; nothing is baked into the image.

| Layer | File | Committed? | Used by |
| --- | --- | --- | --- |
| Template | `.env.example` | yes | reference only |
| Production | `.env` (repo root) | **no** (gitignored) | compose `env_file` → container |
| Local dev | `server/.env` | no | `npm run dev` only |
| Frontend build | `apps/web/.env*` | n/a | build-time `VITE_*` only — none set |

`VITE_API_URL` is deliberately unset so the SPA uses the relative `/api` and
rides through nginx. `.env*` is in both `.gitignore` and `.dockerignore`.

## Deploy / update

```bash
git pull
docker compose up -d --build
docker compose ps
docker compose logs -f erp
```

## Verify

```bash
curl -fsS http://127.0.0.1:8086/api/health    # container directly
curl -I https://erp.example.com/                # through Apache, SPA 200
curl -fsS https://erp.example.com/api/health    # through Apache, JSON
docker compose ps                               # healthy
```

## Housekeeping

- Backups are a Postgres concern (no local DB volume): use Supabase backups or
  `pg_dump` against `DATABASE_URL`.
- Supabase Cloud free tier pauses after ~1 week idle — unpause from the dashboard
  or keep the project warm for a live demo.
- Logs are rotated by compose (`10m`, 3 files). `docker compose logs -f erp`
  shows supervisor, Node and nginx output together.
- Rollback = `git checkout <previous tag> && docker compose up -d --build`.

## Split stack (optional)

To run the original two-container topology instead:

```bash
docker compose -f docker-compose.split.yml up -d --build
```

It uses `127.0.0.1:8086`. Run **one** stack at a time. Both stacks target the
same database, so seeding from both is unnecessary.

## Troubleshooting

- **`erp` exits at boot with "Missing DATABASE_URL"** — `.env` is not next to
  `docker-compose.yml`, or `env_file` could not read it.
- **`connect ENETUNREACH <ipv6-address>:5432`** — you are using the IPv6-only
  direct Supabase host. Switch `DATABASE_URL` to the Session pooler (IPv4).
- **`(ENOIDENTIFIER) no tenant identifier provided`** — the pooler username must
  be `postgres.<project-ref>`, not `postgres`.
- **502 through Apache** — container is down or on a different port:
  `docker ps`, `curl http://127.0.0.1:8086/api/health`, `docker compose logs erp`.
- **Apache 403/404 / Webuzo page** — proxy block missing from the right vhost, or
  `.htaccess` not in the DocumentRoot. See `deploy/apache/README.md`.
- **Apache connection refused but curl works** — SELinux:
  `setsebool -P httpd_can_network_connect 1`.
- **`port is already allocated`** — another app owns 8086. Set `ERP_PORT` in
  `.env` to the next free port and update the Apache proxy target to match.
- **SSL errors to Postgres** — the pool hardcodes
  `ssl: { rejectUnauthorized: false }` (`server/src/db.js`), correct for
  Supabase Cloud. Make it conditional only for a local Postgres without SSL.
