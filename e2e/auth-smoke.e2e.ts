import { expect, test } from '@playwright/test';

test.describe('Web smoke', () => {
  test('login page renders sign-in form', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'YOUniversity2' })).toBeVisible();
    await expect(page.locator('#email')).toBeVisible();
    await expect(page.locator('#password')).toBeVisible();
    await expect(page.getByRole('button', { name: /prihlásiť|sign in/i })).toBeVisible();
  });

  test('student can sign in and reach dashboard', async ({ page }) => {
    await page.goto('/');
    await page.locator('#email').fill('student@local');
    await page.locator('#password').fill('student');
    await page.getByRole('button', { name: /prihlásiť|sign in/i }).click();
    await page.waitForURL('**/dashboard**', { timeout: 30_000 });
    await expect(page.getByRole('link', { name: /prehľad|dashboard/i })).toBeVisible();
  });
});
