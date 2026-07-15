import { sql } from 'drizzle-orm';
import { db } from '../db';
import { pingRedis } from './rate-limit';
import { config } from '../config';
import { HeadBucketCommand, S3Client } from '@aws-sdk/client-s3';

export type HealthStatus = 'ok' | 'degraded' | 'error' | 'not_configured';

export type ReadinessChecks = Record<'database' | 'redis', 'ok' | 'error'>;

export type AdminHealthChecks = ReadinessChecks & {
  storage: HealthStatus;
  email: HealthStatus;
  realtime: HealthStatus;
};

const startedAt = Date.now();

export async function getReadiness(): Promise<{ ok: boolean; checks: ReadinessChecks }> {
  const checks: ReadinessChecks = { database: 'error', redis: 'error' };

  try {
    await db.execute(sql`SELECT 1`);
    checks.database = 'ok';
  } catch {
    checks.database = 'error';
  }

  try {
    if (await pingRedis()) checks.redis = 'ok';
  } catch {
    checks.redis = 'error';
  }

  return { ok: checks.database === 'ok' && checks.redis === 'ok', checks };
}

async function checkStorage(): Promise<HealthStatus> {
  if (!config.s3.endpoint || !config.s3.bucket) return 'not_configured';
  try {
    const s3 = new S3Client({
      region: config.s3.region,
      endpoint: config.s3.endpoint,
      forcePathStyle: true,
      credentials: {
        accessKeyId: config.s3.accessKey,
        secretAccessKey: config.s3.secretKey,
      },
    });
    await s3.send(new HeadBucketCommand({ Bucket: config.s3.bucket }));
    return 'ok';
  } catch {
    return 'error';
  }
}

export async function getAdminHealth() {
  const readiness = await getReadiness();
  const [storage, realtime] = await Promise.all([
    checkStorage(),
    Promise.resolve(readiness.checks.redis === 'ok' ? ('ok' as const) : ('error' as const)),
  ]);

  const checks: AdminHealthChecks = {
    ...readiness.checks,
    storage,
    email: 'not_configured',
    realtime,
  };

  const ok =
    readiness.checks.database === 'ok' &&
    readiness.checks.redis === 'ok' &&
    storage !== 'error';

  return {
    ok,
    checks,
    uptimeSec: Math.floor((Date.now() - startedAt) / 1000),
    version: process.env.npm_package_version ?? '2.0.0',
    environment: process.env.NODE_ENV ?? 'development',
    storageBucket: config.s3.bucket,
    checkedAt: new Date().toISOString(),
  };
}
