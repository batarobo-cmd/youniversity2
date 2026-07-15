#!/usr/bin/env bash
# Diagnostika SCORM uploadu — spusti na serveri a pošli celý výstup.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
COMPOSE="docker compose -f docker-compose.prod.yml"

echo "========== YOUniversity2 SCORM upload diagnostika =========="
echo "Čas: $(date -Is)"
echo "Verzia: $(git describe --tags --always 2>/dev/null || echo unknown)"
echo ""

echo "==> 1. Kontajnery"
$COMPOSE ps
echo ""

echo "==> 2. S3 / MinIO env v API"
$COMPOSE exec -T api sh -c 'echo S3_ENDPOINT=$S3_ENDPOINT; echo S3_BUCKET=$S3_BUCKET; echo S3_ACCESS_KEY=${S3_ACCESS_KEY:0:4}***' 2>/dev/null || echo "WARN: API nebeží"
echo ""

echo "==> 3. MinIO health z API siete"
$COMPOSE exec -T api bun -e "
const endpoint = process.env.S3_ENDPOINT ?? 'missing';
const bucket = process.env.S3_BUCKET ?? 'missing';
console.log('Testing', endpoint, 'bucket', bucket);
try {
  const { S3Client, HeadBucketCommand } = await import('@aws-sdk/client-s3');
  const s3 = new S3Client({
    region: process.env.S3_REGION ?? 'eu-central-1',
    endpoint,
    forcePathStyle: true,
    credentials: {
      accessKeyId: process.env.S3_ACCESS_KEY ?? '',
      secretAccessKey: process.env.S3_SECRET_KEY ?? '',
    },
  });
  await s3.send(new HeadBucketCommand({ Bucket: bucket }));
  console.log('OK: MinIO/S3 bucket reachable');
} catch (e) {
  console.error('FAIL:', e instanceof Error ? e.message : e);
  process.exit(1);
}
" 2>&1 || true
echo ""

echo "==> 4. SCORM tabuľky v Postgres"
$COMPOSE exec -T postgres psql -U youniversity -d youniversity2 -c "\dt scorm_*" 2>&1 || true
echo ""

echo "==> 5. Posledných 80 riadkov API logu (media/scorm, startup, error)"
$COMPOSE logs api --tail 200 2>&1 | grep -iE 'scorm|media/scorm|minio|s3|ensureScorm|error|startup|500' | tail -80 || $COMPOSE logs api --tail 40
echo ""

echo "==> 6. MinIO log (posledných 20)"
$COMPOSE logs minio --tail 20 2>&1 || echo "MinIO kontajner nebeží"
echo ""

echo "========== Koniec diagnostiky =========="
echo "Ak bod 3 zlyhá: docker compose -f docker-compose.prod.yml up -d minio"
echo "Potom skús upload znova a: docker compose -f docker-compose.prod.yml logs api -f --tail 20"
