import { test, expect, uat } from './browser-fixtures.mjs';

test('synthetic existing applicant can track its application without submit or upload requests', async ({ page }) => {
  const forbiddenRequests = [];
  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method())
        || /upload|intake|application/i.test(path) && request.method() !== 'GET') {
      forbiddenRequests.push({ method: request.method(), path });
      await route.abort();
      return;
    }
    await route.continue();
  });

  await page.goto('/cek-pengajuan');
  await page.getByLabel('Nomor berkas, NIK, atau nomor WhatsApp').fill(uat.applicant.nik);
  await page.getByRole('button', { name: 'Lacak pengajuan' }).click();
  await expect(page.getByText('Ringkasan pengajuan')).toBeVisible();
  const fileNo = page.locator('p.font-mono').filter({ hasText: /^MST-/ });
  await expect(fileNo).toHaveCount(1);
  await expect(fileNo).toBeVisible();
  await expect(page.getByText('Perkembangan berkas')).toBeVisible();
  expect(forbiddenRequests).toEqual([]);
});
