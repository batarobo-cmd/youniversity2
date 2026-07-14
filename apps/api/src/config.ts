import { env } from './env';

export const config = {
  port: env.PORT,
  jwtSecret: env.JWT_SECRET,
  jwtExpiresIn: env.JWT_EXPIRES_IN,
  sessionIdleMs: env.SESSION_IDLE_MS,
  sessionBrowserClosedMs: env.SESSION_BROWSER_CLOSED_MS,
  corsOrigin: env.CORS_ORIGIN,
  redisUrl: env.REDIS_URL,
  aiTranslation: {
    apiUrl: env.AI_TRANSLATION_API_URL,
    apiKey: env.AI_TRANSLATION_API_KEY,
    model: env.AI_TRANSLATION_MODEL,
  },
  s3: {
    endpoint: env.S3_ENDPOINT,
    bucket: env.S3_BUCKET,
    accessKey: env.S3_ACCESS_KEY,
    secretKey: env.S3_SECRET_KEY,
    region: env.S3_REGION,
  },
  turnstile: {
    siteKey: env.TURNSTILE_SITE_KEY,
    secretKey: env.TURNSTILE_SECRET_KEY,
  },
  oauth: {
    google: {
      clientId: env.GOOGLE_CLIENT_ID,
      clientSecret: env.GOOGLE_CLIENT_SECRET,
    },
    microsoft: {
      clientId: env.MICROSOFT_CLIENT_ID,
      clientSecret: env.MICROSOFT_CLIENT_SECRET,
      tenantId: env.MICROSOFT_TENANT_ID,
    },
    apiUrl: env.API_URL,
    webUrl: env.WEB_URL,
  },
  nodeEnv: env.NODE_ENV,
  databaseUrl: env.DATABASE_URL,
  globalRateLimit: {
    max: env.GLOBAL_RATE_LIMIT_MAX,
    windowSec: env.GLOBAL_RATE_LIMIT_WINDOW_SEC,
  },
};
