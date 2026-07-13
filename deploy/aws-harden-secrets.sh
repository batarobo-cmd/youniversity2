#!/usr/bin/env bash
# Bezpečná rotácia produkčných secretov na bežiacej AWS inštancii.
# Rotuje: PostgreSQL heslo, JWT_SECRET, nastaví NODE_ENV=production.
# MinIO heslo NEMENÍ (volume si drží pôvodné credentials — zmeň manuálne ak treba).
#
# Použitie: cd ~/youniversity2 && chmod +x deploy/aws-harden-secrets.sh && ./deploy/aws-harden-secrets.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
COMPOSE="docker compose -f docker-compose.prod.yml"
ENV_FILE="${ROOT}/.env"

if [ ! -f "$ENV_FILE" ]; then
  echo "CHYBA: Chýba .env"
  exit 1
fi

gen_secret() {
  openssl rand -hex 32
}

gen_password() {
  openssl rand -base64 24 | tr -d '/+=' | head -c 32
}

upsert_env() {
  local key="$1"
  local value="$2"
  if grep -q "^${key}=" "$ENV_FILE"; then
    sed -i "s|^${key}=.*|${key}=${value}|" "$ENV_FILE"
  else
    echo "${key}=${value}" >> "$ENV_FILE"
  fi
}

echo "==> Záloha .env"
cp "$ENV_FILE" "${ENV_FILE}.bak.$(date +%Y%m%d-%H%M%S)"

NEW_JWT="$(gen_secret)"
NEW_DB_PASS="$(gen_password)"

echo ""
echo "Vygenerované nové hodnoty:"
echo "  JWT_SECRET        = ${NEW_JWT:0:8}... (64 hex)"
echo "  POSTGRES_PASSWORD = ${NEW_DB_PASS:0:4}... (${#NEW_DB_PASS} znakov)"
echo ""
echo "POZOR: Všetci používatelia budú odhlásení (nový JWT)."
echo "MinIO/S3 heslo sa NEMENÍ — port 9000 nie je verejný, existujúce súbory zostanú."
echo ""
read -r -p "Pokračovať? [y/N] " confirm
if [ "$confirm" != "y" ] && [ "$confirm" != "Y" ]; then
  echo "Zrušené."
  exit 0
fi

echo ""
echo "==> 1/4 PostgreSQL — ALTER USER youniversity"
$COMPOSE exec -T postgres psql -U youniversity -d youniversity2 \
  -c "ALTER USER youniversity WITH PASSWORD '${NEW_DB_PASS}';"

upsert_env POSTGRES_PASSWORD "$NEW_DB_PASS"
upsert_env DATABASE_URL "postgresql://youniversity:${NEW_DB_PASS}@postgres:5432/youniversity2"

echo "==> 2/4 JWT_SECRET"
upsert_env JWT_SECRET "$NEW_JWT"

echo "==> 3/4 NODE_ENV=production + explicitný S3 blok (ak chýba)"
upsert_env NODE_ENV production
grep -q '^S3_ENDPOINT=' "$ENV_FILE" || upsert_env S3_ENDPOINT "http://minio:9000"
grep -q '^S3_BUCKET=' "$ENV_FILE" || upsert_env S3_BUCKET "youniversity2"
grep -q '^S3_ACCESS_KEY=' "$ENV_FILE" || upsert_env S3_ACCESS_KEY "minioadmin"
grep -q '^S3_REGION=' "$ENV_FILE" || upsert_env S3_REGION "eu-central-1"

echo "==> 4/4 Reštart API + Web"
$COMPOSE up -d --force-recreate api web

sleep 6
if ! $COMPOSE ps api --status running -q | grep -q .; then
  echo "CHYBA: API nebeží — pozri logy:"
  $COMPOSE logs api --tail 40
  exit 1
fi

echo ""
echo "Hotovo."
echo "Ďalší krok — zmeň demo heslá:"
echo "  chmod +x deploy/aws-change-demo-passwords.sh"
echo "  ./deploy/aws-change-demo-passwords.sh 'TvojeSilneHeslo123!'"
echo ""
echo "Overenie:"
echo "  curl -sL -o /dev/null -w 'health=%{http_code}\n' https://elearning.batacon.sk/health"
