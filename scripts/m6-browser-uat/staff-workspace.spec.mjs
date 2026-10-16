import { test, expect, uat } from './browser-fixtures.mjs';
import { expectDownloadedPdf, openSyntheticCase, signIn } from './browser-helpers.mjs';

test('assigned staff can inspect the seeded case and download its source document and receipt', async ({ page }) => {
  await signIn(page, uat.staff);
  await openSyntheticCase(page, uat.staffCaseName);

  await page.getByRole('tab', { name: 'Proses' }).click();
  await expect(page.getByText('Penyaluran Berhasil Tuntas')).toBeVisible();
  await expect(page.getByText(/PPD|pencairan dana/i).first()).toBeVisible();
  await expect(page.getByText('Bukti Digital Penyaluran Resmi Siap Diunduh')).toBeVisible();

  await page.getByRole('tab', { name: 'Dokumen' }).click();
  await expect(page.getByRole('button', { name: `Unduh berkas ${uat.documentName}` })).toBeVisible();
  await expectDownloadedPdf(
    page,
    page.getByRole('button', { name: `Unduh berkas ${uat.documentName}` }),
  );
  await page.getByRole('tab', { name: 'Proses' }).click();
  await expectDownloadedPdf(
    page,
    page.getByRole('button', { name: 'Unduh Bukti Digital Penyaluran (PDF)' }),
    { expectedMime: 'application/pdf' },
  );
});

test('staff cannot perform finance review on the synthetic pending PPD case', async ({ page }) => {
  await signIn(page, uat.staff);
  await openSyntheticCase(page, uat.ppdReviewCaseName);
  await page.getByRole('tab', { name: 'Proses' }).click();

  await expect(
    page.getByText('Tinjauan Keuangan hanya dapat diproses oleh Divisi Keuangan. Anda saat ini melihat dalam mode baca.'),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Konfirmasi Pemeriksaan Keuangan' })).toHaveCount(0);
});

test('finance can view the review control without executing it', async ({ page }) => {
  await signIn(page, uat.finance);
  await openSyntheticCase(page, uat.ppdReviewCaseName);
  await page.getByRole('tab', { name: 'Proses' }).click();
  await expect(page.getByRole('button', { name: 'Konfirmasi Pemeriksaan Keuangan' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Konfirmasi Pemeriksaan Keuangan' })).toBeEnabled();
});
