# Cloudflare Turnstile — YOUniversity2

Spin **v2** uses canonical siteverify in the existing API (no extra Worker).

## 1) Create widget (Cloudflare Dashboard)

1. [dash.cloudflare.com](https://dash.cloudflare.com) → **Turnstile** → Add site
2. Domains:
   - `localhost`
   - `127.0.0.1`
   - `elearning.batacon.sk`
   - `elearning.batacon.eu`
3. Widget mode: **Managed**
4. Copy **Site Key** and **Secret Key**

## 2) Or create via API (token required)

```bash
export CLOUDFLARE_API_TOKEN='<token with Account.Turnstile:Edit>'
chmod +x deploy/turnstile-spin/scripts/*.sh
./deploy/turnstile-spin/scripts/auth-probe.sh
./deploy/turnstile-spin/scripts/widget-create.sh \
  --account-id "$CLOUDFLARE_ACCOUNT_ID" \
  --name "youniversity2 (Spin)" \
  --domains "localhost,127.0.0.1,elearning.batacon.sk,elearning.batacon.eu" \
  --mode managed
```

Save `sitekey` → `TURNSTILE_SITE_KEY`, `secret` → `TURNSTILE_SECRET_KEY` (never commit).

## 3) Production `.env`

```env
TURNSTILE_SITE_KEY=0x4AAAAAAA...
TURNSTILE_SECRET_KEY=0x4AAAAAAA...
```

```bash
docker compose -f docker-compose.prod.yml up -d --force-recreate api
```

## 4) Validate

```bash
# Dummy token must return success:false
curl -s -X POST 'https://challenges.cloudflare.com/turnstile/v0/siteverify' \
  -d "secret=$TURNSTILE_SECRET_KEY&response=XXXX.DUMMY.TOKEN.XXXX"

# Register without token → 403 (when secret is set)
curl -s -w "\nHTTP %{http_code}\n" \
  -X POST 'https://elearning.batacon.sk/api/auth/register' \
  -H 'Content-Type: application/json' \
  -d '{"email":"a@batacon.sk","password":"TestHeslo123!","givenName":"A","familyName":"B"}'
```

## Insertion point

- `apps/web/src/lib/components/RegisterManualForm.svelte` — widget
- `apps/web/src/routes/+page.server.ts` — passes `cf-turnstile-response`
- `apps/api/src/services/turnstile.ts` — canonical siteverify
