#!/usr/bin/env bash
# Nastavenie Let's Encrypt HTTPS pre elearning.batacon.eu + elearning.batacon.sk
# Spusti na Lightsail serveri v koreňovom priečinku projektu.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

PRIMARY_DOMAIN="${PRIMARY_DOMAIN:-elearning.batacon.sk}"
ALT_DOMAIN="${ALT_DOMAIN:-elearning.batacon.eu}"
CERT_NAME="${CERT_NAME:-$PRIMARY_DOMAIN}"
CERTBOT_EMAIL="${CERTBOT_EMAIL:-}"

if [ -z "$CERTBOT_EMAIL" ]; then
  echo "Použitie: CERTBOT_EMAIL=tvoj@email.sk ./deploy/aws-setup-https.sh"
  exit 1
fi

if [ ! -f .env ]; then
  echo "CHYBA: Chýba .env — najprv nastav produkčné premenné."
  exit 1
fi

echo "==> Kontrola DNS (musí ukázať na túto IP)..."
PUBLIC_IP="$(curl -s https://checkip.amazonaws.com | tr -d '[:space:]')"
for host in "$PRIMARY_DOMAIN" "$ALT_DOMAIN"; do
  resolved="$(getent hosts "$host" | awk '{print $1}' | head -n1 || true)"
  echo "  $host -> ${resolved:-NEVYRIEŠENÉ} (očakávané: $PUBLIC_IP)"
done

echo "==> Inštalácia certbot (ak chýba)..."
if ! command -v certbot >/dev/null 2>&1; then
  sudo apt-get update
  sudo apt-get install -y certbot
fi

mkdir -p docker/certbot/www

echo "==> Dočasne HTTP nginx (pre ACME challenge)..."
cp docker/nginx.conf docker/nginx.http.conf.bak 2>/dev/null || true
docker compose -f docker-compose.prod.yml up -d nginx

echo "==> Vydanie certifikátu..."
sudo certbot certonly --webroot \
  -w "$ROOT/docker/certbot/www" \
  -d "$PRIMARY_DOMAIN" \
  -d "$ALT_DOMAIN" \
  --email "$CERTBOT_EMAIL" \
  --agree-tos \
  --no-eff-email \
  --cert-name "$CERT_NAME"

echo "==> Prepínanie na HTTPS nginx..."
cp docker/nginx.https.conf docker/nginx.conf
docker compose -f docker-compose.prod.yml up -d --force-recreate nginx

BASE_URL="https://$PRIMARY_DOMAIN"
echo "==> Aktualizácia .env..."
for key in PUBLIC_URL API_URL WEB_URL CORS_ORIGIN; do
  if grep -q "^${key}=" .env; then
    sed -i "s|^${key}=.*|${key}=${BASE_URL}|" .env
  else
    echo "${key}=${BASE_URL}" >> .env
  fi
done
if grep -q '^COOKIE_SECURE=' .env; then
  sed -i 's/^COOKIE_SECURE=.*/COOKIE_SECURE=true/' .env
else
  echo 'COOKIE_SECURE=true' >> .env
fi

echo "==> Reštart web + api..."
docker compose -f docker-compose.prod.yml up -d --force-recreate web api

echo ""
echo "Hotovo."
echo "  https://$PRIMARY_DOMAIN"
echo "  https://$ALT_DOMAIN"
echo ""
echo "Obnova certifikátu (cron — odporúčané):"
echo "  0 3 * * * certbot renew --quiet && cd $ROOT && docker compose -f docker-compose.prod.yml exec -T nginx nginx -s reload"
