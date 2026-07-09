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
echo "==> Verzia buildu: ${VITE_APP_VERSION}"

echo "==> Build a štart kontajnerov..."
docker compose -f docker-compose.prod.yml up -d --build

echo "==> Čakám na PostgreSQL..."
sleep 12

echo "==> DB schéma + seed..."
docker compose -f docker-compose.prod.yml exec -T api bun run db:push
docker compose -f docker-compose.prod.yml exec -T api bun run db:ensure-demo

echo ""
echo "Hotovo. Otvor v prehliadači:"
grep -E '^PUBLIC_URL=' .env | cut -d= -f2- || grep -E '^WEB_URL=' .env | cut -d= -f2-
echo ""
echo "Demo: admin@youniversity2.sk / admin123"
