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

echo "==> Rebuild a reštart kontajnerov..."
docker compose -f docker-compose.prod.yml build --no-cache web api
docker compose -f docker-compose.prod.yml up -d --force-recreate web api nginx

echo "==> Stav kontajnerov..."
docker compose -f docker-compose.prod.yml ps

echo "==> DB schéma..."
sleep 8
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
