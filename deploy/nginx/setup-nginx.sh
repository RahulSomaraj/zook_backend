#!/usr/bin/env bash
#
# Run THIS ON THE AZURE VM (not your laptop).
# Installs nginx and deploys the uatapi.zookapp.com vhost (HTTP only).
#
# Usage (from the repo dir on the server):
#   chmod +x deploy/nginx/setup-nginx.sh
#   sudo ./deploy/nginx/setup-nginx.sh
#
# Prerequisites:
#   1. DNS A record: uatapi.zookapp.com -> this VM's public IP
#   2. Azure NSG: inbound port 80 open
#   3. The NestJS app running on 127.0.0.1:3000 (pm2)

set -euo pipefail

DOMAIN="uatapi.zookapp.com"
CONF_SRC="$(dirname "$0")/${DOMAIN}.conf"

if [[ $EUID -ne 0 ]]; then
  echo "ERROR: run with sudo."; exit 1
fi

echo ">>> [1/3] Installing nginx"
apt-get update -y
apt-get install -y nginx

echo ">>> [2/3] Installing vhost for ${DOMAIN}"
cp "$CONF_SRC" "/etc/nginx/sites-available/${DOMAIN}"
ln -sf "/etc/nginx/sites-available/${DOMAIN}" "/etc/nginx/sites-enabled/${DOMAIN}"

echo ">>> [3/3] Testing config and reloading nginx"
nginx -t
systemctl enable nginx
systemctl reload nginx

echo ">>> Done. Test: curl -I http://${DOMAIN}/docs"
