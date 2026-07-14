#!/usr/bin/env bash
# Spusti na čistej Ubuntu Lightsail inštancii (alebo EC2).
set -euo pipefail

echo "==> Inštalácia Dockeru..."
if ! command -v docker >/dev/null 2>&1; then
  curl -fsSL https://get.docker.com | sh
  sudo usermod -aG docker "$USER" || true
fi

echo "==> Kontrola docker compose..."
docker compose version

if [ ! -f .env ]; then
  echo "CHYBA: Chýba súbor .env"
  echo "Skopíruj .env.production.example -> .env a nastav PUBLIC_URL / heslá."
  exit 1
fi

export VITE_APP_VERSION="$(git rev-parse --short HEAD)"
export WEB_BUILD_HEAP_MB="${WEB_BUILD_HEAP_MB:-768}"
export DOCKER_BUILDKIT=1
export COMPOSE_PARALLEL_LIMIT=1
echo "==> Verzia buildu: ${VITE_APP_VERSION} (WEB_BUILD_HEAP_MB=${WEB_BUILD_HEAP_MB})"

echo "==> Build kontajnerov (postupne — 2 GB profil)..."
docker compose -f docker-compose.prod.yml build api
docker compose -f docker-compose.prod.yml stop web nginx 2>/dev/null || true
docker compose -f docker-compose.prod.yml build web

echo "==> Štart kontajnerov..."
docker compose -f docker-compose.prod.yml up -d --force-recreate

echo "==> Čakám na PostgreSQL..."
sleep 12

echo "==> DB migrácie + seed..."
docker compose -f docker-compose.prod.yml exec -T api bun run db:migrate
docker compose -f docker-compose.prod.yml exec -T api bun run db:ensure-demo

echo ""
echo "Hotovo. Otvor v prehliadači:"
grep -E '^PUBLIC_URL=' .env | cut -d= -f2- || grep -E '^WEB_URL=' .env | cut -d= -f2-
echo ""
echo "Demo účty: nastav heslá cez ./deploy/aws-change-demo-passwords.sh '<STRONG_PASSWORD>'"
