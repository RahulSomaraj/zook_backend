#!/usr/bin/env bash
#
# Auto-deploy the Zook backend to an Azure VM over SSH.
#
# Flow: SSH in -> git pull -> npm ci -> prisma generate + migrate deploy
#       -> nest build -> pm2 reload (or start on first run).
#
# Usage:
#   cp scripts/deploy.config.example.sh scripts/deploy.config.sh   # then edit it
#   ./scripts/deploy.sh                 # deploy DEPLOY_BRANCH from config
#   ./scripts/deploy.sh main            # override branch
#
# Requires: ssh + the private key referenced in deploy.config.sh.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONFIG_FILE="$SCRIPT_DIR/deploy.config.sh"

if [[ ! -f "$CONFIG_FILE" ]]; then
  echo "ERROR: $CONFIG_FILE not found."
  echo "Run: cp scripts/deploy.config.example.sh scripts/deploy.config.sh  (then edit it)"
  exit 1
fi

# shellcheck source=/dev/null
source "$CONFIG_FILE"

# Allow branch override from the command line.
BRANCH="${1:-${DEPLOY_BRANCH:-develop}}"

: "${DEPLOY_HOST:?set DEPLOY_HOST in deploy.config.sh}"
: "${DEPLOY_USER:?set DEPLOY_USER in deploy.config.sh}"
: "${DEPLOY_PATH:?set DEPLOY_PATH in deploy.config.sh}"
: "${PM2_APP_NAME:?set PM2_APP_NAME in deploy.config.sh}"
SSH_PORT="${DEPLOY_SSH_PORT:-22}"

SSH_OPTS=(-p "$SSH_PORT" -o StrictHostKeyChecking=accept-new)
if [[ -n "${DEPLOY_SSH_KEY:-}" ]]; then
  SSH_OPTS+=(-i "$DEPLOY_SSH_KEY")
fi

echo ">>> Deploying branch '$BRANCH' to $DEPLOY_USER@$DEPLOY_HOST:$DEPLOY_PATH"

# The remote script. Runs entirely on the Azure VM.
# Variables are expanded locally before being sent, except $- escaped ones.
ssh "${SSH_OPTS[@]}" "$DEPLOY_USER@$DEPLOY_HOST" \
  DEPLOY_PATH="$DEPLOY_PATH" BRANCH="$BRANCH" PM2_APP_NAME="$PM2_APP_NAME" \
  'bash -s' <<'REMOTE'
set -euo pipefail

echo ">>> [remote] cd $DEPLOY_PATH"
cd "$DEPLOY_PATH"

echo ">>> [remote] Fetching latest code"
git fetch --all --prune
git checkout "$BRANCH"
git reset --hard "origin/$BRANCH"

echo ">>> [remote] Installing dependencies"
npm ci

echo ">>> [remote] Prisma generate + migrate deploy"
npx prisma generate
npx prisma migrate deploy

echo ">>> [remote] Building"
npm run build

echo ">>> [remote] Restarting via PM2"
if pm2 describe "$PM2_APP_NAME" > /dev/null 2>&1; then
  pm2 reload "$PM2_APP_NAME" --update-env
else
  pm2 start ecosystem.config.js --env production
fi
pm2 save

echo ">>> [remote] Done. Current status:"
pm2 status "$PM2_APP_NAME"
REMOTE

echo ">>> Deploy complete."
