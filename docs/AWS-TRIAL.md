# AWS trial — 1 týždeň (Lightsail)

Najjednoduchší spôsob ako otestovať YOUniversity2 na AWS bez drahého load balanceru a RDS.

**Odhad ceny:** ~$10–20 za týždeň (podľa veľkosti inštancie).

## Čo dostaneš

- Jedna Lightsail inštancia (Ubuntu)
- Docker Compose: nginx + API + web + PostgreSQL + Redis + MinIO
- Verejná IP, prístup cez `http://TVOJA_IP`

## 1. Vytvor Lightsail inštanciu

1. Prihlás sa do [AWS Lightsail](https://lightsail.aws.amazon.com/)
2. **Create instance**
   - Platform: **Linux/Unix**
   - Blueprint: **Ubuntu 22.04** alebo **24.04**
   - Plán: **$10/mes.** (1 GB) alebo radšej **$20/mes.** (2 GB) — odporúčané
3. Po vytvorení: **Networking** → otvor port **80 (HTTP)**
4. Zapíš si **Static IP** (Create static IP a pripoj k inštancii)

## 2. Pripoj sa cez SSH

V Lightsail: instance → **Connect using SSH** (alebo stiahni `.pem` a použij terminál).

## 3. Naklonuj projekt

```bash
sudo apt-get update && sudo apt-get install -y git
git clone https://github.com/batarobo-cmd/youniversity2.git
cd youniversity2
```

## 4. Nastav `.env`

```bash
cp .env.production.example .env
nano .env
```

Nahraď `YOUR_LIGHTSAIL_IP` skutočnou IP (napr. `http://54.123.45.67`).

**Povinné zmeny:**
- `POSTGRES_PASSWORD` — silné heslo
- `S3_SECRET_KEY` — silné heslo
- `JWT_SECRET` — náhodný reťazec (napr. `openssl rand -hex 32`)

Všetky tri URL musia sedieť s IP:
- `API_URL`
- `WEB_URL`
- `CORS_ORIGIN`

## 5. Spusti deploy

```bash
chmod +x deploy/aws-trial-bootstrap.sh
./deploy/aws-trial-bootstrap.sh
```

Trvá cca 5–10 minút (prvý build).

## 6. Otestuj

Otvor v prehliadači: `http://TVOJA_STATIC_IP`

| Účet | E-mail | Heslo |
|------|--------|-------|
| Admin | admin@youniversity2.sk | nastavené cez `deploy/aws-change-demo-passwords.sh` |
| Študent | student@youniversity2.sk | to isté |

Pri prvom bootstrap-e môžete do `.env` pridať `DEMO_BOOTSTRAP_PASSWORD` (min. 12 znakov), potom heslo vždy zmeňte skriptom vyššie.

Health check API: `http://TVOJA_IP/health`

## Aktualizácia po zmene v Cursore

Na **lokálnom PC** (commit + push):

```bash
git add .
git commit -m "..."
git push origin main
```

Na **serveri** (SSH):

```bash
cd ~/youniversity2
./deploy/aws-trial-update.sh
```

Skript sám spraví `git pull` a pri HTTPS (`.env` s `https://` URL) automaticky nastaví `docker/nginx.https.conf`.

**Pomalý alebo „zamrznutý“ build?** Na 1 GB Lightsail je normálne, že krok `web build` + `exporting layers` trvá niekoľko minút. Skript teraz používa Docker cache (rýchlejšie opakované deploye). Čistý rebuild len keď treba:

```bash
FULL_REBUILD=1 ./deploy/aws-trial-update.sh
```

Odporúčaná veľkosť inštancie: **2 GB RAM** ($20/mes.). Pri 1 GB pridaj swap:

```bash
sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile && sudo mkswap /swapfile && sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```

Alebo manuálne:

```bash
cd ~/youniversity2
git pull
docker compose -f docker-compose.prod.yml up -d --build
docker compose -f docker-compose.prod.yml exec -T api bun run db:push
```

## Užitočné príkazy na serveri

```bash
# Logy
docker compose -f docker-compose.prod.yml logs -f

# Reštart
docker compose -f docker-compose.prod.yml restart

# Zastavenie (šetrí peniaze keď netestuješ)
docker compose -f docker-compose.prod.yml down

# Znova štart
docker compose -f docker-compose.prod.yml up -d
```

## Po týždni — vypni všetko

1. Na serveri: `docker compose -f docker-compose.prod.yml down`
2. V Lightsail: **Stop** inštanciu, alebo **Delete** inštanciu + static IP (ak už nepotrebuješ)

Tým prestaneš platiť (okrem prípadného úložiska snapshotov).

## HTTPS s vlastnou doménou

A záznamy na Websupport stačia ako prvý krok:

| Host | Typ | Hodnota |
|------|-----|---------|
| `elearning.batacon.sk` | A | `52.58.37.65` |
| `elearning.batacon.eu` | A | `52.58.37.65` |

**Ešte musíš:**

1. **Lightsail firewall** — otvor porty **80** (HTTP) a **443** (HTTPS)  
   Lightsail → instance → **Networking** → IPv4 firewall → Add rule

2. **Počkať na DNS propagáciu** (5–60 min, niekedy dlhšie):
   ```bash
   dig +short elearning.batacon.sk
   dig +short elearning.batacon.eu
   ```
   Obe musia vrátiť `52.58.37.65`.

3. **Na serveri** stiahni najnovší kód a spusti HTTPS skript:
   ```bash
   cd ~/youniversity2
   git pull --ff-only origin main
   chmod +x deploy/aws-setup-https.sh
   CERTBOT_EMAIL=tvoj@email.sk ./deploy/aws-setup-https.sh
   ```

   Skript:
   - vydá Let's Encrypt certifikát pre obe domény
   - prepne nginx na HTTPS
   - upraví `.env` (`https://elearning.batacon.sk`, `COOKIE_SECURE=true`)
   - reštartuje web + api

4. **Otestuj v prehliadači:**
   - https://elearning.batacon.sk
   - https://elearning.batacon.eu

**Primárna doména** je `elearning.batacon.sk` (OAuth redirecty, cookies). Druhá doména funguje tiež, obe majú rovnaký certifikát.

**Obnova certifikátu** (pridaj do cron na serveri):
```bash
sudo crontab -e
# 0 3 * * * certbot renew --quiet && cd ~/youniversity2 && docker compose -f docker-compose.prod.yml exec -T nginx nginx -s reload
```

## HTTPS (starý skratkový popis)

Pre skúšobný týždeň stačí HTTP. Pre HTTPS neskôr:
- Lightsail load balancer + certifikát, alebo
- `./deploy/aws-setup-https.sh` s Certbot (odporúčané pre tento projekt)

## Riešenie problémov

| Problém | Riešenie |
|---------|----------|
| Stránka sa nenačíta | Skontroluj port 80 vo firewall (Lightsail Networking) |
| API error | `docker compose -f docker-compose.prod.yml logs api` |
| Prázdna DB | `bun run docker:prod:init-db` na serveri v priečinku projektu |
| Nedostatok RAM (1 GB) | Prejdi na $20 plán (2 GB) |

## Čo ďalej (produkcia)

Pre viac používateľov rozdeliť na RDS, ElastiCache, ECS + CI/CD z GitHubu — to nie je nutné na týždenný test.
