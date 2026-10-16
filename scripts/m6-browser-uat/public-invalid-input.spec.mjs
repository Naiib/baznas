import { test, expect } from './browser-fixtures.mjs';

test('public intake rejects empty applicant details client-side without mutations', async ({ page }) => {
  const blockedMutations = [];
  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (request.method() !== 'GET') {
      blockedMutations.push({ method: request.method(), path: url.pathname });
      await route.abort();
      return;
    }
    await route.continue();
  });

  await page.goto('/pengajuan');
  await page.getByRole('button', { name: 'Lanjut' }).click();
  await expect(page.getByText('Nama lengkap wajib diisi.', { exact: true })).toBeVisible();
  expect(blockedMutations).toEqual([]);
});
