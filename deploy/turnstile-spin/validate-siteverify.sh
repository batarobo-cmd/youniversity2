#!/usr/bin/env bash
# Local validation: dummy Turnstile token must return success:false.
# Usage: TURNSTILE_SECRET_KEY=0x... ./deploy/turnstile-spin/validate-siteverify.sh
set -euo pipefail

: "${TURNSTILE_SECRET_KEY:?Set TURNSTILE_SECRET_KEY}"

resp=$(curl -sS -X POST 'https://challenges.cloudflare.com/turnstile/v0/siteverify' \
  -d "secret=${TURNSTILE_SECRET_KEY}&response=XXXX.DUMMY.TOKEN.XXXX")

success=$(echo "$resp" | (jq -r '.success' 2>/dev/null || python3 -c "import sys,json; print(json.load(sys.stdin).get('success'))"))
errors=$(echo "$resp" | (jq -r '.["error-codes"] | length' 2>/dev/null || echo "0"))

if [ "$success" = "false" ] && [ "$errors" != "0" ]; then
  echo "OK: canonical siteverify responds correctly (success:false)"
  exit 0
fi

echo "FAIL: unexpected response: $resp"
exit 1
