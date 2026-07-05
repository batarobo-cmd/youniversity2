export const config = {
  port: Number(process.env.PORT ?? 3001),
  jwtSecret: process.env.JWT_SECRET ?? 'dev-secret-change-in-production',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? '7d',
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
};
