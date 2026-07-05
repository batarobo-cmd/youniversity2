# YOUniversity2

Realtime Learning Management System — moderný, ľahký a pripravený na AWS.

## Stack

| Vrstva | Technológia |
|--------|-------------|
| Runtime | Bun |
| API | Hono + WebSockets |
| ORM | Drizzle + PostgreSQL |
| Realtime | WebSockets + Redis Pub/Sub |
| Frontend | SvelteKit |
| Storage | MinIO (dev) / AWS S3 (prod) |
| Preklady | OpenAI-compatible API (AI) + manuálne verzie |

## Funkcie (MVP)

- Autentifikácia (admin / instructor / student)
- Kurzy s modulmi a lekciami (video embed, quiz, text, prezentácie)
- Enrollmenty
- Realtime synchronizácia (admin ↔ študent)
- Sledovanie aktivity študentov
- Vyhodnocovanie kurzu (pass/fail) + certifikáty
- Viacjazyčnosť (SK, EN, CS, DE, HU) + AI preklad kurzu

## Požiadavky

- [Bun](https://bun.sh) ≥ 1.2
- [Docker](https://docker.com) (PostgreSQL, Redis, MinIO)
- Git

## Rýchly štart

```bash
# 1. Klon / prejdite do projektu
cd Projects/YOUniversity2

# 2. Skopírujte env
cp .env.example .env

# 3. Spustite infraštruktúru
docker compose up -d

# 4. Inštalujte závislosti
bun install

# 5. Push DB schémy + seed
bun run db:push
bun run db:seed

# 6. Spustite dev servery
bun run dev
```

- **Web:** http://localhost:5173
- **API:** http://localhost:3001
- **WebSocket:** ws://localhost:3001/ws?token=\<jwt\>
- **MinIO Console:** http://localhost:9001 (minioadmin / minioadmin)

### Demo účty (po seed)

| Rola | E-mail | Heslo |
|------|--------|-------|
| Admin | admin@youniversity2.sk | admin123 |
| Študent | student@youniversity2.sk | student123 |

## Štruktúra projektu

```
YOUniversity2/
├── apps/
│   ├── api/          # Hono backend + WebSocket + Drizzle
│   └── web/          # SvelteKit frontend
├── packages/
│   └── shared/       # Spoločné typy, konštanty, WS eventy
├── docker-compose.yml
└── .env.example
```

## Realtime architektúra

```
Študent (WS) ──► API Hub ──► Redis Pub/Sub ──► Admin dashboard
                     │
                     └──► PostgreSQL (activity_events, progress)
```

Udalosti: `course.opened`, `lesson.opened`, `quiz.completed`, `video.progress`, ...

## AI preklady

Nastavte v `.env`:

```env
AI_TRANSLATION_API_KEY=sk-...
AI_TRANSLATION_MODEL=gpt-4o-mini
```

Pre AWS Bedrock použite kompatibilný proxy endpoint v `AI_TRANSLATION_API_URL`.

Bez API kľúča sa preklady označia prefixom `[EN]` (dev fallback).

## AWS deployment (plán)

| Služba | AWS ekvivalent |
|--------|----------------|
| API + WS | ECS Fargate alebo App Runner |
| PostgreSQL | RDS PostgreSQL |
| Redis | ElastiCache |
| Súbory | S3 + CloudFront |
| Video | S3 + MediaConvert (HLS) |
| Secrets | AWS Secrets Manager |

Odhad pre ~100 súčasných používateľov: **t3.small** alebo **Fargate 0.25 vCPU / 512 MB**.

## Ďalšie kroky

1. Upload videí + PPT pipeline (S3 + ffmpeg/LibreOffice)
2. Plný quiz engine s otázkami v DB
3. PDF generovanie certifikátov
4. Pokročilé admin CRUD (tvorba kurzov cez UI)
5. AWS CDK / Terraform infra

## Licencia

Private — YOUniversity2
