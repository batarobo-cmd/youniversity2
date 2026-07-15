#!/usr/bin/env bash
# Kompletný rebuild pre 1 GB Lightsail (swap odporúčaný).
# Usage: LOW_RAM=1 FULL_REBUILD=1 ./deploy/aws-rebuild-1gb.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

export LOW_RAM=1
export WEB_BUILD_HEAP_MB="${WEB_BUILD_HEAP_MB:-512}"
export FULL_REBUILD="${FULL_REBUILD:-1}"

if grep -qE '^(PUBLIC_URL|WEB_URL|API_URL)=https://' .env 2>/dev/null; then
  cp docker/nginx.https.conf docker/nginx.conf
fi

docker compose -f docker-compose.prod.yml exec -T redis redis-cli DEL ratelimit:global:unknown 2>/dev/null || true

exec "$ROOT/deploy/aws-trial-update.sh"
