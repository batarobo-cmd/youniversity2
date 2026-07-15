import { expect, test } from '@playwright/test';

const webUrl = process.env.PLAYWRIGHT_BASE_URL ?? 'http://127.0.0.1:4173';
const apiUrl = process.env.PLAYWRIGHT_API_URL ?? 'http://localhost:3001';

test.describe('Web smoke', () => {
  test('login page renders sign-in form', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'YOUniversity2' })).toBeVisible();
    await expect(page.locator('#email')).toBeVisible();
    await expect(page.locator('#password')).toBeVisible();
    await expect(page.getByRole('button', { name: /prihlásiť|sign in/i })).toBeVisible();
  });

  test('login action accepts demo credentials', async ({ request }) => {
    const res = await request.post(`${webUrl}/?/login`, {
      form: { email: 'student@local', password: 'student' },
      headers: { Accept: 'text/html,application/xhtml+xml' },
      maxRedirects: 0,
    });
    expect(res.status()).toBe(303);
    expect(res.headers()['location']).toMatch(/\/dashboard/);
    expect(res.headers()['set-cookie']).toMatch(/yo2_session=/);
  });

  test('student session reaches dashboard', async ({ page, request }) => {
    const login = await request.post(`${apiUrl}/api/auth/login`, {
      data: { email: 'student@local', password: 'student' },
    });
    expect(login.ok()).toBeTruthy();
    const { sessionId } = (await login.json()) as { sessionId: string };

    await page.context().addCookies([
      {
        name: 'yo2_session',
        value: sessionId,
        url: webUrl,
        httpOnly: true,
        sameSite: 'Lax',
      },
    ]);

    await page.goto('/dashboard');
    await expect(page.getByRole('link', { name: /prehľad|dashboard/i })).toBeVisible();
  });
});
