import { describe, expect, test } from 'bun:test';
import { Hono } from 'hono';
import { requestIdMiddleware } from './middleware/request-id';

describe('health routes', () => {
  test('live endpoint returns ok', async () => {
    const app = new Hono();
    app.use('*', requestIdMiddleware);
    app.get('/health/live', (c) => c.json({ status: 'ok', service: 'youniversity2-api' }));

    const res = await app.request('/health/live');
    expect(res.status).toBe(200);
    const body = (await res.json()) as { status: string };
    expect(body.status).toBe('ok');
    expect(res.headers.get('X-Request-Id')).toBeTruthy();
  });
});
