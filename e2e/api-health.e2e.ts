import { expect, test } from '@playwright/test';

const apiUrl = process.env.PLAYWRIGHT_API_URL ?? 'http://localhost:3001';

test.describe('API smoke', () => {
  test('live health responds', async ({ request }) => {
    const res = await request.get(`${apiUrl}/health/live`);
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body).toMatchObject({ status: 'ok', service: 'youniversity2-api' });
    expect(res.headers()['x-request-id']).toBeTruthy();
  });

  test('ready health responds with dependency checks', async ({ request }) => {
    const res = await request.get(`${apiUrl}/health/ready`);
    const body = await res.json();
    expect(body).toMatchObject({
      service: 'youniversity2-api',
      checks: {
        database: 'ok',
        redis: 'ok',
      },
    });
    expect(res.ok()).toBeTruthy();
  });
});
