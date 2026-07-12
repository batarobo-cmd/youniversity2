#!/usr/bin/env bash
# Aktualizácia už bežiaceho AWS trial nasadenia po git push.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "==> Git pull..."
git fetch origin main
# Ignore local chmod-only edits to deploy scripts from older pulls.
git restore deploy/aws-trial-update.sh deploy/aws-trial-bootstrap.sh 2>/dev/null || true
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

echo "==> Rebuild kontajnerov (postupne — menej RAM na malých inštanciách)..."
echo "    Tip: na 1 GB Lightsail môže web build trvať 3–8 min; 'exporting layers' nie je zamrznutie."
docker compose -f docker-compose.prod.yml build --progress=plain "${BUILD_FLAGS[@]}" api
docker compose -f docker-compose.prod.yml build --progress=plain "${BUILD_FLAGS[@]}" web

echo "==> Reštart kontajnerov..."
docker compose -f docker-compose.prod.yml up -d --force-recreate web api nginx

echo "==> Stav kontajnerov..."
docker compose -f docker-compose.prod.yml ps

echo "==> Čakám na API..."
sleep 8

echo "==> Migrácia čísel certifikátov (pred zmenou schémy)..."
docker compose -f docker-compose.prod.yml exec -T api bun run db:migrate-cert-numbers || {
  echo "WARN: db:migrate-cert-numbers zlyhal — skontrolujte API logy"
}

echo "==> DB schéma..."
docker compose -f docker-compose.prod.yml exec -T api bun run db:push || {
  echo "WARN: db:push zlyhal — skontrolujte API logy"
}

echo ""
echo "Hotovo — $(git describe --tags --always)"
grep -E '^PUBLIC_URL=' .env | cut -d= -f2- || grep -E '^WEB_URL=' .env | cut -d= -f2-

echo ""
echo "==> Rýchly test..."
curl -s -o /dev/null -w "health=%{http_code} " http://127.0.0.1/health || true
curl -s -o /dev/null -w "web=%{http_code}\n" --max-time 15 http://127.0.0.1/ || true
