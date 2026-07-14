import { sql } from 'drizzle-orm';
import { db } from '../db';
import { pingRedis } from './rate-limit';

export type ReadinessChecks = Record<'database' | 'redis', 'ok' | 'error'>;

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
