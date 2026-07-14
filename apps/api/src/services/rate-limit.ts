import Redis from 'ioredis';
import { config } from '../config';

let redis: Redis | null = null;

function getRedis(): Redis {
  if (!redis) {
    redis = new Redis(config.redisUrl, { maxRetriesPerRequest: 3, lazyConnect: true });
  }
  return redis;
}

function rateLimitRedisKey(key: string): string {
  return `ratelimit:${key}`;
}

/** Returns true when the limit is already reached (check only, no increment). */
export async function isRateLimited(key: string, limit: number): Promise<boolean> {
  const r = getRedis();
  const countRaw = await r.get(rateLimitRedisKey(key));
  const count = Number(countRaw ?? 0);
  return count >= limit;
}

/** Records one failed attempt against a rate-limit key. */
export async function recordRateLimitFailure(key: string, windowSec: number): Promise<void> {
  const r = getRedis();
  const redisKey = rateLimitRedisKey(key);
  const count = await r.incr(redisKey);
  if (count === 1) {
    await r.expire(redisKey, windowSec);
  }
}

/** Returns true when the action is allowed, false when rate limit exceeded. */
export async function consumeRateLimit(
  key: string,
  limit: number,
  windowSec: number,
): Promise<boolean> {
  const r = getRedis();
  const redisKey = rateLimitRedisKey(key);
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

/** Lightweight Redis ping for readiness probes. */
export async function pingRedis(): Promise<boolean> {
  const r = getRedis();
  const result = await r.ping();
  return result === 'PONG';
}
