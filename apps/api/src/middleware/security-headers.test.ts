import { describe, expect, test } from 'bun:test';
import { Hono } from 'hono';
import { apiSecurityHeaders } from './security-headers';

describe('apiSecurityHeaders', () => {
  test('sets baseline security headers on API responses', async () => {
    const app = new Hono();
    app.use('*', apiSecurityHeaders);
    app.get('/test', (c) => c.json({ ok: true }));

    const res = await app.request('/test');
    expect(res.status).toBe(200);
    expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(res.headers.get('X-Frame-Options')).toBe('SAMEORIGIN');
    expect(res.headers.get('Referrer-Policy')).toBe('strict-origin-when-cross-origin');
  });
});
