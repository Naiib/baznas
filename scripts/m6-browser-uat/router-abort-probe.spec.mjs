import { test, expect, uat } from './browser-fixtures.mjs';
import { signIn } from './browser-helpers.mjs';
import { normalizedRequestPath } from './request-diagnostics.mjs';

test('single staff router probe records idle, Link, and direct-navigation checkpoints', async ({ page }, testInfo) => {
  const apiResponses = [];
  page.on('response', (response) => {
    const url = new URL(response.url());
    if (url.pathname.startsWith('/api/penyaluran/')) {
      apiResponses.push(`${response.request().method()} ${normalizedRequestPath(url.pathname)} ${response.status()}`);
    }
  });

  await signIn(page, uat.staff);
  const checkpoints = [];
  const checkpoint = async (label) => {
    await expect(page.locator('main')).toBeVisible();
    checkpoints.push(`${label}:${new URL(page.url()).pathname}:main-visible`);
  };

  await page.waitForTimeout(1200);
  await checkpoint('idle');
  await page.getByRole('link', { name: 'Beranda' }).click();
  await expect(page).toHaveURL(/\/penyaluran$/);
  await checkpoint('link-to-home');
  await page.getByRole('link', { name: 'Mustahik' }).click();
  await expect(page).toHaveURL(/\/penyaluran\/mustahik$/);
  await checkpoint('link-to-mustahik');
  await page.goto('/penyaluran');
  await expect(page).toHaveURL(/\/penyaluran$/);
  await checkpoint('direct-to-home');

  testInfo.annotations.push({ type: 'sanitized-router-checkpoints', description: checkpoints.join(' | ') });
  testInfo.annotations.push({ type: 'sanitized-api-responses', description: apiResponses.join(' | ') || 'none' });
});
