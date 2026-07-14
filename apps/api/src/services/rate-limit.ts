import Redis from 'ioredis';
import { config } from '../config';

let redis: Redis | null = null;

function getRedis(): Redis {
  if (!redis) {
    redis = new Redis(config.redisUrl, { maxRetriesPerRequest: 3, lazyConnect: true });
  }
  return redis;
}

/** Returns true when the action is allowed, false when rate limit exceeded. */
export async function consumeRateLimit(
  key: string,
  limit: number,
  windowSec: number,
): Promise<boolean> {
  const r = getRedis();
  const redisKey = `ratelimit:${key}`;
  const count = await r.incr(redisKey);
  if (count === 1) {
    await r.expire(redisKey, windowSec);
  }
  return count <= limit;
}

export function clientIpFromHeaders(
  forwardedFor?: string | null,
  realIp?: string | null,
): string | undefined {
  if (forwardedFor) {
    const first = forwardedFor.split(',')[0]?.trim();
    if (first) return first;
  }
  return realIp?.trim() || undefined;
}
