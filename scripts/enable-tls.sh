#!/usr/bin/env bash
set -euo pipefail
domain=agents.vlyntro.com
# Run only after the A record points to this VPS. Existing virtual hosts are untouched.
mkdir -p /var/www/letsencrypt
certbot certonly --webroot -w /var/www/letsencrypt -d "$domain" --non-interactive --agree-tos --email "${ACME_EMAIL:?Set ACME_EMAIL}"
config_file=/etc/nginx/sites-available/vlyntro-agents-tls
test ! -e "$config_file" || { echo 'TLS virtual host already exists. Inspect it before updating.' >&2; exit 1; }
cat > "$config_file" <<'NGINX'
server {
    listen 443 ssl;
    listen [::]:443 ssl;
    server_name agents.vlyntro.com;
    ssl_certificate /etc/letsencrypt/live/agents.vlyntro.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/agents.vlyntro.com/privkey.pem;
    include /etc/letsencrypt/options-ssl-nginx.conf;
    add_header Strict-Transport-Security "max-age=31536000" always;
    location / {
        proxy_pass http://127.0.0.1:3080;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_buffering off;
        proxy_read_timeout 300s;
        client_max_body_size 1m;
    }
}
NGINX
ln -s "$config_file" /etc/nginx/sites-enabled/vlyntro-agents-tls
nginx -t
systemctl reload nginx
mkdir -p /etc/letsencrypt/renewal-hooks/deploy
printf '#!/bin/sh\nnginx -t && systemctl reload nginx\n' > /etc/letsencrypt/renewal-hooks/deploy/vlyntro-reload-nginx
chmod 755 /etc/letsencrypt/renewal-hooks/deploy/vlyntro-reload-nginx
