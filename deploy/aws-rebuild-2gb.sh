#!/usr/bin/env bash
# Full rebuild pre 2 GB Lightsail (predvolený profil).
# Použitie: ./deploy/aws-rebuild-2gb.sh
#           FULL_REBUILD=1 ./deploy/aws-rebuild-2gb.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

export WEB_BUILD_HEAP_MB="${WEB_BUILD_HEAP_MB:-768}"
unset LOW_RAM

exec env FULL_REBUILD="${FULL_REBUILD:-0}" WEB_BUILD_HEAP_MB="$WEB_BUILD_HEAP_MB" \
  "$ROOT/deploy/aws-trial-update.sh"
