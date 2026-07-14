import type { MiddlewareHandler } from 'hono';
import { config } from '../config';
import { clientIpFromHeaders, consumeRateLimit } from '../services/rate-limit';

function isRateLimitExemptPath(pathname: string): boolean {
  if (pathname === '/health' || pathname.startsWith('/health/')) return true;
  if (pathname === '/ws') return true;
  return false;
}

export const globalRateLimitMiddleware: MiddlewareHandler = async (c, next) => {
  if (c.req.method === 'OPTIONS' || isRateLimitExemptPath(c.req.path)) {
    await next();
    return;
  }

  const clientIp =
    clientIpFromHeaders(c.req.header('X-Forwarded-For'), c.req.header('X-Real-IP')) ?? 'unknown';
  const key = `global:${clientIp}`;

  try {
    const allowed = await consumeRateLimit(
      key,
      config.globalRateLimit.max,
      config.globalRateLimit.windowSec,
    );
    if (!allowed) {
      return c.json({ error: 'Too many requests', code: 'rate_limited' }, 429);
    }
  } catch (err) {
    console.warn('[rate-limit] Redis unavailable, skipping global limit:', err);
  }

  await next();
};
