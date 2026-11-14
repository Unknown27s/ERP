# Apache / Webuzo reverse proxy

Webuzo's Apache is the only public listener (`:80` / `:443`, TLS, Let's
Encrypt). Docker applications bind to **loopback only** on unusual high ports.
Each co-hosted application gets its own vhost, its own port and its own Docker
network.

```
Internet
  └─ Apache/Webuzo :443  (erp.example.com)
       └─ http://127.0.0.1:8086
            └─ erp container (nginx :8080 -> API :4000 -> Supabase)
```

## Port allocation on this server

| App | Compose project | Docker network | Loopback port |
| --- | --- | --- | --- |
| MarvelSoftware ERP | `erp` | `erp_net` | **8086** |
| ERP split stack (optional) | `erp-split` | `erp_split_net` | **8086** |
| Next app | its own | its own | 8087+ |

Rules:

- One unique port per app. ERP uses 8086 because 8080-8085, 8000/8443 and 9000
  are already used by other projects; the next app takes 8087, 8088, …
- Keep the Docker publish loopback-only: `127.0.0.1:PORT:PORT`. Never `0.0.0.0`.
- Give each app its own bridge network name (`erp_net`, `lms_net`, …) so service
  DNS names can never collide.
- Check before assigning a port: `ss -tlnp | grep -E '808[6-9]|809[0-9]'`

## Install the vhost (recommended)

1. In Webuzo create the domain/subdomain and enable SSL (Let's Encrypt).
2. Edit the vhost Webuzo generated:

   ```bash
   ls /usr/local/apps/apache/conf/webuzo/vhosts/
   vi /usr/local/apps/apache/conf/webuzo/vhosts/erp.example.com.conf
   ```

3. Inside `<VirtualHost *:443>` add the **PROXY BLOCK** from
   [`subdomain-vhost.conf`](./subdomain-vhost.conf). If the `:80` vhost does
   not redirect to HTTPS, add the block there too with
   `X-Forwarded-Proto "http"`.
4. Confirm modules and SELinux permission:

   ```bash
   /usr/local/apps/apache/bin/httpd -M | grep -E 'proxy|headers|ssl|rewrite'
   getenforce
   setsebool -P httpd_can_network_connect 1   # only if SELinux is enforcing
   ```

5. Test and reload:

   ```bash
   /usr/local/apps/apache/bin/apachectl configtest
   /usr/local/apps/apache/bin/apachectl graceful
   ```

## Install with .htaccess (fallback)

Copy [`subdomain.htaccess`](./subdomain.htaccess) into the domain's DocumentRoot
as `.htaccess`. It requires `AllowOverride FileInfo` (Webuzo normally enables
it). Use the `RewriteRule ... [P]` form there - `ProxyPass` is invalid in
`.htaccess`.

## Verify

```bash
# Directly against the container (bypasses Apache):
curl -fsS http://127.0.0.1:8086/api/health

# Through Apache on the server:
curl -fsS --resolve erp.example.com:443:127.0.0.1 https://erp.example.com/api/health

# From outside:
curl -I https://erp.example.com/
```

Expected: `200`, `Server: nginx`, and a JSON health response - not a Webuzo
404/panel page.

## Troubleshooting

| Symptom | Cause / fix |
| --- | --- |
| 503/502 from Apache | Container down or wrong port: `docker ps`, `curl 127.0.0.1:8086`. |
| 403/404 Webuzo page | Proxy block not in the right vhost, or `.htaccess` not in the docroot. |
| 500 with `.htaccess` | Missing `mod_headers`/`mod_proxy`, or `AllowOverride` disallows `FileInfo`. |
| Connection refused from Apache | SELinux blocked it: `setsebool -P httpd_can_network_connect 1`. |
| Port already allocated | Another app uses 8086. Pick the next free port and update both `.env` and the vhost. |
| Certificate renewal fails | Keep `ProxyPass /.well-known/ !` (vhost) or the `!^/\.well-known` condition (`.htaccess`). |
