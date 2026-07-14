import { z } from 'zod';

const DEV_JWT_SECRET = 'dev-secret-change-in-production';
const DEV_DATABASE_URL = 'postgresql://youniversity:youniversity@localhost:5432/youniversity2';

const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
    PORT: z.coerce.number().int().min(1).max(65535).default(3001),
    DATABASE_URL: z.string().min(1).default(DEV_DATABASE_URL),
    REDIS_URL: z.string().min(1).default('redis://localhost:6379'),
    JWT_SECRET: z.string().min(1).default(DEV_JWT_SECRET),
    JWT_EXPIRES_IN: z.string().min(1).default('7d'),
    SESSION_IDLE_MS: z.coerce.number().int().positive().default(60 * 60 * 1000),
    SESSION_BROWSER_CLOSED_MS: z.coerce.number().int().positive().default(30 * 60 * 1000),
    CORS_ORIGIN: z.string().url().default('http://localhost:5173'),
    AI_TRANSLATION_API_URL: z.string().url().default('https://api.openai.com/v1'),
    AI_TRANSLATION_API_KEY: z.string().default(''),
    AI_TRANSLATION_MODEL: z.string().min(1).default('gpt-4o-mini'),
    S3_ENDPOINT: z.string().url().default('http://localhost:9000'),
    S3_BUCKET: z.string().min(1).default('youniversity2'),
    S3_ACCESS_KEY: z.string().min(1).default('minioadmin'),
    S3_SECRET_KEY: z.string().min(1).default('minioadmin'),
    S3_REGION: z.string().min(1).default('eu-central-1'),
    TURNSTILE_SITE_KEY: z.string().default(''),
    TURNSTILE_SECRET_KEY: z.string().default(''),
    GOOGLE_CLIENT_ID: z.string().default(''),
    GOOGLE_CLIENT_SECRET: z.string().default(''),
    MICROSOFT_CLIENT_ID: z.string().default(''),
    MICROSOFT_CLIENT_SECRET: z.string().default(''),
    MICROSOFT_TENANT_ID: z.string().min(1).default('common'),
    API_URL: z.string().url().default('http://localhost:3001'),
    WEB_URL: z.string().url().default('http://localhost:5173'),
    BOOTSTRAP_SYSTEM_ADMIN_EMAIL: z.string().default(''),
    DEMO_BOOTSTRAP_PASSWORD: z.string().optional(),
    GLOBAL_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(600),
    GLOBAL_RATE_LIMIT_WINDOW_SEC: z.coerce.number().int().positive().default(900),
  })
  .superRefine((data, ctx) => {
    if (data.NODE_ENV !== 'production') return;

    if (data.JWT_SECRET === DEV_JWT_SECRET || data.JWT_SECRET.length < 32) {
      ctx.addIssue({
        code: 'custom',
        path: ['JWT_SECRET'],
        message:
          'V produkcii nastavte JWT_SECRET aspoň 32 znakov (nie predvolenú dev hodnotu).',
      });
    }

    if (data.DATABASE_URL === DEV_DATABASE_URL) {
      ctx.addIssue({
        code: 'custom',
        path: ['DATABASE_URL'],
        message: 'V produkcii nastavte DATABASE_URL na reálnu databázu.',
      });
    }

    if (data.S3_ACCESS_KEY === 'minioadmin' && data.S3_SECRET_KEY === 'minioadmin') {
      ctx.addIssue({
        code: 'custom',
        path: ['S3_SECRET_KEY'],
        message: 'V produkcii nepoužívajte predvolené MinIO credentials.',
      });
    }
  });

export type Env = z.infer<typeof envSchema>;

function formatEnvErrors(error: z.ZodError): string {
  return error.issues
    .map((issue) => {
      const path = issue.path.length ? issue.path.join('.') : 'env';
      return `  • ${path}: ${issue.message}`;
    })
    .join('\n');
}

export function loadEnv(raw: NodeJS.ProcessEnv = process.env): Env {
  const result = envSchema.safeParse(raw);
  if (!result.success) {
    console.error('[env] Neplatná konfigurácia prostredia:\n' + formatEnvErrors(result.error));
    process.exit(1);
  }
  return result.data;
}

/** Validované env — načíta sa raz pri importe modulu. */
export const env = loadEnv();
