#!/usr/bin/env bash
# Aktualizácia už bežiaceho AWS trial nasadenia po git push.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "==> Git pull..."
git fetch origin main
# Ignore local chmod-only edits to deploy scripts from older pulls.
git restore \
  deploy/aws-trial-update.sh \
  deploy/aws-trial-bootstrap.sh \
  deploy/aws-harden-secrets.sh \
  deploy/aws-change-demo-passwords.sh \
  2>/dev/null || true
git pull --ff-only origin main

if grep -qE '^(PUBLIC_URL|WEB_URL|API_URL)=https://' .env 2>/dev/null; then
  echo "==> HTTPS server — aplikujem docker/nginx.https.conf"
  cp docker/nginx.https.conf docker/nginx.conf
fi

export VITE_APP_VERSION="$(git rev-parse --short HEAD)"
echo "==> Verzia buildu: ${VITE_APP_VERSION}"

BUILD_FLAGS=()
if [ "${FULL_REBUILD:-0}" = "1" ]; then
  echo "==> FULL_REBUILD=1 — rebuild bez Docker cache"
  BUILD_FLAGS+=(--no-cache)
else
  echo "==> Inkrementálny rebuild (Docker cache). Pre čistý rebuild: FULL_REBUILD=1 ./deploy/aws-trial-update.sh"
fi

export DOCKER_BUILDKIT=1
export COMPOSE_PARALLEL_LIMIT=1

if [ "${LOW_RAM:-0}" = "1" ]; then
  export WEB_BUILD_HEAP_MB="${WEB_BUILD_HEAP_MB:-512}"
  echo "==> 1 GB build profile — WEB_BUILD_HEAP_MB=${WEB_BUILD_HEAP_MB}"
  echo "    Pred web buildom uvoľním RAM (stop web, nginx, api, minio)..."
  if ! swapon --show 2>/dev/null | grep -q .; then
    echo "    WARN: aktívny swap nebol nájdený — odporúčame 2G swapfile (docs/AWS-TRIAL.md)"
  fi
  docker compose -f docker-compose.prod.yml stop web nginx api minio 2>/dev/null || true
else
  export WEB_BUILD_HEAP_MB="${WEB_BUILD_HEAP_MB:-768}"
  echo "==> 2 GB build profile — WEB_BUILD_HEAP_MB=${WEB_BUILD_HEAP_MB}"
fi

echo "==> Rebuild kontajnerov (postupne — menej špičkového RAM)..."
if [ "${LOW_RAM:-0}" = "1" ]; then
  echo "    Tip: na 1 GB Lightsail web build trvá 5–15 min; LOW_RAM=1 WEB_BUILD_HEAP_MB=512"
else
  echo "    Tip: na 2 GB Lightsail web build zvyčajne 2–8 min; pred web buildom stopnem len web+nginx"
fi
docker compose -f docker-compose.prod.yml build --progress=plain "${BUILD_FLAGS[@]}" api

if [ "${LOW_RAM:-0}" != "1" ]; then
  echo "==> Uvoľňujem RAM pre web build (web + nginx)..."
  docker compose -f docker-compose.prod.yml stop web nginx 2>/dev/null || true
fi

docker compose -f docker-compose.prod.yml build --progress=plain "${BUILD_FLAGS[@]}" web

echo "==> DB migrácie (pred reštartom API — nový image, bez bežiaceho kontajnera)..."
docker compose -f docker-compose.prod.yml run --rm --no-deps api bun run db:migrate || {
  echo "WARN: db:migrate zlyhal — skontrolujte logy nižšie"
}

echo "==> Reštart kontajnerov..."
docker compose -f docker-compose.prod.yml up -d --force-recreate web api nginx

echo "==> Stav kontajnerov..."
docker compose -f docker-compose.prod.yml ps

echo "==> Čakám na API..."
sleep 8

if ! docker compose -f docker-compose.prod.yml ps api --status running -q | grep -q .; then
  echo "WARN: API kontajner nebeží — logy:"
  docker compose -f docker-compose.prod.yml logs api --tail 40 || true
fi

echo "==> Migrácia čísel certifikátov (pred zmenou schémy)..."
docker compose -f docker-compose.prod.yml exec -T api bun run db:migrate-cert-numbers || {
  echo "WARN: db:migrate-cert-numbers zlyhal — skontrolujte API logy"
}

echo ""
echo "Hotovo — $(git describe --tags --always)"
grep -E '^PUBLIC_URL=' .env | cut -d= -f2- || grep -E '^WEB_URL=' .env | cut -d= -f2-

echo ""
echo "==> Rýchly test..."
HEALTH_BASE="http://127.0.0.1"
if grep -qE '^(PUBLIC_URL|WEB_URL)=https://' .env 2>/dev/null; then
  HEALTH_BASE="https://127.0.0.1"
fi
curl -skL -o /dev/null -w "health=%{http_code} " "${HEALTH_BASE}/health" || true
curl -skL -o /dev/null -w "web=%{http_code}\n" --max-time 15 "${HEALTH_BASE}/" || true
