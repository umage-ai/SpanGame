#!/usr/bin/env bash
# One-time setup of SPAN on the Ubuntu + nginx server (docs/DEPLOY.md). Copy-paste it into a root shell (sudo -i),
# or run:  sudo bash setup-server.sh "<public deploy key>"
#   - user deployspan (no password, no sudo) that GitHub Actions logs in as with the deploy key, and may only write
#     the two web roots
#   - https://span.studio.umage.ai       -> /var/www/span       (production: published GitHub releases)
#   - https://test.span.studio.umage.ai  -> /var/www/span-test  (test: every push to main)
#   - Let's Encrypt certificates for both (certbot), http -> https redirects
# Safe to run again (it rewrites both site files and reinstalls the existing certificates).
set -euo pipefail

PUBKEY="${1:-${PUBKEY:-}}"
USER_NAME=deployspan
declare -A SITES=( [span.studio.umage.ai]=/var/www/span [test.span.studio.umage.ai]=/var/www/span-test )

[ "$(id -u)" = 0 ] || { echo "run as root (sudo -i)"; exit 1; }
[ -n "$PUBKEY" ] || { echo "set PUBKEY to the public deploy key (ssh-ed25519 AAAA... deployspan@...)"; exit 1; }
command -v nginx >/dev/null || { echo "nginx is not installed"; exit 1; }
command -v rsync >/dev/null || apt-get install -y rsync
command -v certbot >/dev/null || apt-get install -y certbot python3-certbot-nginx

# --- the deploy user
id "$USER_NAME" >/dev/null 2>&1 || adduser --disabled-password --gecos "SPAN deploy (GitHub Actions)" "$USER_NAME"
install -d -m 700 -o "$USER_NAME" -g "$USER_NAME" "/home/$USER_NAME/.ssh"
touch "/home/$USER_NAME/.ssh/authorized_keys"
grep -qxF "$PUBKEY" "/home/$USER_NAME/.ssh/authorized_keys" || echo "$PUBKEY" >> "/home/$USER_NAME/.ssh/authorized_keys"
chown "$USER_NAME:$USER_NAME" "/home/$USER_NAME/.ssh/authorized_keys"
chmod 600 "/home/$USER_NAME/.ssh/authorized_keys"

for DOMAIN in "${!SITES[@]}"; do
  ROOT="${SITES[$DOMAIN]}"
  NAME="${ROOT##*/}"   # span | span-test (log file names)

  # --- the web root, writable by the deploy user, readable by nginx
  install -d -o "$USER_NAME" -g www-data -m 755 "$ROOT"
  if [ ! -f "$ROOT/index.html" ]; then
    echo '<!doctype html><meta charset="utf-8"><title>SPAN</title><p>SPAN is on its way.</p>' > "$ROOT/index.html"
    chown "$USER_NAME:www-data" "$ROOT/index.html"
  fi

  # --- the nginx site (http; certbot adds https and the redirect below)
  cat > "/etc/nginx/sites-available/$DOMAIN" <<NGINX
# SPAN ($DOMAIN), written by SpanGame deploy/setup-server.sh. Static files rsynced by GitHub Actions (deployspan).
server {
    listen 80;
    listen [::]:80;
    server_name $DOMAIN;
    root $ROOT;
    index index.html;

    # own logs; Ubuntu's logrotate keeps /var/log/nginx/*.log for 14 days (stated in privacy.html)
    access_log /var/log/nginx/$NAME.access.log;
    error_log /var/log/nginx/$NAME.error.log;

    charset utf-8;
    gzip on;
    gzip_types text/css text/javascript application/javascript application/json application/manifest+json image/svg+xml;

    # the service worker, pages and manifest are always revalidated, so a deploy reaches players at once
    # (the worker precaches with cache:'reload', so everything else may be cached for an hour)
    location = /sw.js {
        add_header Cache-Control "no-cache" always;
        add_header X-Content-Type-Options nosniff always;
    }
    location ~ \.html\$ {
        add_header Cache-Control "no-cache" always;
        add_header X-Content-Type-Options nosniff always;
    }
    # nginx's stock mime.types lacks .webmanifest: set it here only (a server-wide "types" block would replace the
    # whole MIME table and serve html and js as application/octet-stream)
    location ~ \.webmanifest\$ {
        types { }
        default_type application/manifest+json;
        add_header Cache-Control "no-cache" always;
        add_header X-Content-Type-Options nosniff always;
    }
    location / {
        try_files \$uri \$uri/ =404;
        add_header Cache-Control "public, max-age=3600" always;
        add_header X-Content-Type-Options nosniff always;
        add_header Referrer-Policy strict-origin-when-cross-origin always;
    }
}
NGINX
  ln -sf "/etc/nginx/sites-available/$DOMAIN" "/etc/nginx/sites-enabled/$DOMAIN"
done

nginx -t
systemctl reload nginx

# --- certificates (adds the 443 server blocks and http -> https redirects to the site files)
for DOMAIN in "${!SITES[@]}"; do
  # --keep-until-expiring: a re-run (which rewrites the site file above) reinstalls the existing certificate
  certbot --nginx -d "$DOMAIN" --redirect --keep-until-expiring --non-interactive --agree-tos --register-unsafely-without-email \
    || echo "!! certbot failed for $DOMAIN: check that DNS points here, then run: certbot --nginx -d $DOMAIN --redirect"
done

echo
for DOMAIN in "${!SITES[@]}"; do echo "ok: https://$DOMAIN  ->  ${SITES[$DOMAIN]}"; done
echo "GitHub Actions deploys as $USER_NAME@$(hostname -f)."
