import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import Redis from 'ioredis';

const TEST_IP = '203.0.113.77';

let authRoutes: import('./auth').authRoutes;
const redis = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379');

async function loginRequest(email: string, password: string, ip = TEST_IP) {
  return authRoutes.request('/login', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Forwarded-For': ip,
    },
    body: JSON.stringify({ email, password }),
  });
}

async function clearLoginRateLimits(email: string, ip = TEST_IP) {
  await redis.del(`ratelimit:login:ip:${ip}`, `ratelimit:login:email:${email.toLowerCase()}`);
}

beforeAll(async () => {
  ({ authRoutes } = await import('./auth'));
});

afterAll(async () => {
  await clearLoginRateLimits('student@local');
  await redis.quit();
});

describe('POST /login', () => {
  test('returns session for valid demo credentials', async () => {
    const res = await loginRequest('student', 'student');
    expect(res.status).toBe(200);
    const body = (await res.json()) as { sessionId?: string; user?: { email: string } };
    expect(body.sessionId).toBeTruthy();
    expect(body.user?.email).toBe('student@local');
  });

  test('returns 401 for invalid password', async () => {
    const res = await loginRequest('student', 'wrong-password');
    expect(res.status).toBe(401);
    const body = (await res.json()) as { error?: string };
    expect(body.error).toBe('Invalid credentials');
  });

  test('returns 429 after repeated failed attempts', async () => {
    const email = `rate-limit-${Date.now()}@local`;
    const ip = '203.0.113.99';

    for (let attempt = 0; attempt < 10; attempt += 1) {
      const res = await loginRequest(email, 'wrong', ip);
      expect(res.status).toBe(401);
    }

    const blocked = await loginRequest(email, 'wrong', ip);
    expect(blocked.status).toBe(429);
    const body = (await blocked.json()) as { code?: string };
    expect(body.code).toBe('rate_limited');

    await clearLoginRateLimits(email, ip);
  });
});
