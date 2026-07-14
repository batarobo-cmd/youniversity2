export const config = {
  port: Number(process.env.PORT ?? 3001),
  jwtSecret: process.env.JWT_SECRET ?? 'dev-secret-change-in-production',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? '7d',
  /** Neaktivita (žiadna interakcia) — odhlásenie po 1 hodine */
  sessionIdleMs: Number(process.env.SESSION_IDLE_MS ?? 60 * 60 * 1000),
  /** Zatvorený prehliadač (žiadny heartbeat) — odhlásenie po 30 minútach */
  sessionBrowserClosedMs: Number(process.env.SESSION_BROWSER_CLOSED_MS ?? 30 * 60 * 1000),
  corsOrigin: process.env.CORS_ORIGIN ?? 'http://localhost:5173',
  redisUrl: process.env.REDIS_URL ?? 'redis://localhost:6379',
  aiTranslation: {
    apiUrl: process.env.AI_TRANSLATION_API_URL ?? 'https://api.openai.com/v1',
    apiKey: process.env.AI_TRANSLATION_API_KEY ?? '',
    model: process.env.AI_TRANSLATION_MODEL ?? 'gpt-4o-mini',
  },
  s3: {
    endpoint: process.env.S3_ENDPOINT ?? 'http://localhost:9000',
    bucket: process.env.S3_BUCKET ?? 'youniversity2',
    accessKey: process.env.S3_ACCESS_KEY ?? 'minioadmin',
    secretKey: process.env.S3_SECRET_KEY ?? 'minioadmin',
    region: process.env.S3_REGION ?? 'eu-central-1',
  },
  turnstile: {
    siteKey: process.env.TURNSTILE_SITE_KEY ?? '',
    secretKey: process.env.TURNSTILE_SECRET_KEY ?? '',
  },
  oauth: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID ?? '',
      clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? '',
    },
    microsoft: {
      clientId: process.env.MICROSOFT_CLIENT_ID ?? '',
      clientSecret: process.env.MICROSOFT_CLIENT_SECRET ?? '',
      tenantId: process.env.MICROSOFT_TENANT_ID ?? 'common',
    },
    apiUrl: process.env.API_URL ?? 'http://localhost:3001',
    webUrl: process.env.WEB_URL ?? 'http://localhost:5173',
  },
};
