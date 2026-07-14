# Cloudflare Turnstile — AWS produkcia

Len pre **https://elearning.batacon.sk** a **https://elearning.batacon.eu**. Lokálny dev Turnstile nepotrebujeme.

Spin **v2**: widget na registračnom formulári + canonical siteverify v API (`apps/api/src/services/turnstile.ts`). Žiadny extra Worker.

---

## 1) Cloudflare Dashboard

1. [dash.cloudflare.com](https://dash.cloudflare.com) → **Turnstile** → **Add site**
2. **Hostname management** — len produkčné domény:
   - `elearning.batacon.sk`
   - `elearning.batacon.eu`
3. Widget mode: **Managed**
4. Skopíruj **Site Key** a **Secret Key**

---

## 2) AWS server — `.env`

SSH na Lightsail, potom:

```bash
cd ~/youniversity2
nano .env
```

Pridaj (alebo uprav):

```env
TURNSTILE_SITE_KEY=0x4AAAAAAA...
TURNSTILE_SECRET_KEY=0x4AAAAAAA...
```

Ulož a deploy:

```bash
git pull --ff-only origin main
./deploy/aws-trial-update.sh
```

---

## 3) Auth nastavenia (admin GUI)

https://elearning.batacon.sk → **Admin → Auth nastavenia**

| Nastavenie | Hodnota |
|------------|---------|
| Manuálna registrácia | Zapnutá |
| Domény pre registráciu | `batacon.sk` + `batacon.eu` (každá na riadok) |
| Domény pre prihlásenie | voliteľne to isté |

---

## 4) Overenie na produkcii

```bash
cd ~/youniversity2

# Secret odpovedá (dummy token → success:false)
TURNSTILE_SECRET_KEY="$(grep '^TURNSTILE_SECRET_KEY=' .env | cut -d= -f2-)" \
  ./deploy/turnstile-spin/validate-siteverify.sh

# API bez captcha → 403
curl -s -w "\nHTTP %{http_code}\n" \
  -X POST 'https://elearning.batacon.sk/api/auth/register' \
  -H 'Content-Type: application/json' \
  -d '{"email":"test@batacon.sk","password":"TestHeslo123!","givenName":"Test","familyName":"User"}'

# Site key v API
docker compose -f docker-compose.prod.yml exec -T api sh -lc \
  'test -n "$TURNSTILE_SITE_KEY" && echo SITE_KEY=set || echo SITE_KEY=MISSING'
docker compose -f docker-compose.prod.yml exec -T api sh -lc \
  'test -n "$TURNSTILE_SECRET_KEY" && echo SECRET_KEY=set || echo SECRET_KEY=MISSING'
```

V prehliadači (Incognito): https://elearning.batacon.sk → Registrovať sa → Turnstile widget → formulár s Krstné meno / Priezvisko.

---

## Kód (už nasadený)

- `apps/web/src/lib/components/RegisterManualForm.svelte`
- `apps/web/src/routes/+page.svelte` (Turnstile script)
- `apps/web/src/routes/+page.server.ts` → `cf-turnstile-response`
- `apps/api/src/routes/auth.ts` → register + siteverify
