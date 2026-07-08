#!/usr/bin/env bash
# Aktualizácia už bežiaceho AWS trial nasadenia po git push.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "==> Git pull..."
git pull origin main

echo "==> Rebuild a reštart kontajnerov..."
docker compose -f docker-compose.prod.yml up -d --build

echo "==> DB schéma..."
sleep 8
docker compose -f docker-compose.prod.yml exec -T api bun run db:push

echo ""
echo "Hotovo — $(git describe --tags --always)"
grep -E '^PUBLIC_URL=' .env | cut -d= -f2- || grep -E '^WEB_URL=' .env | cut -d= -f2-
