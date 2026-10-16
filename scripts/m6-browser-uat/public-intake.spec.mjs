import { test, expect, uat } from './browser-fixtures.mjs';

test('public applicant submits a synthetic intake and sees its tracking confirmation', async ({ page }) => {
  await page.goto('/pengajuan');
  await expect(page.getByRole('heading', { name: /Permohonan bantuan yang mudah dipahami/ })).toBeVisible();
  await page.keyboard.press('Tab');
  await expect(page.locator(":focus-visible")).toBeVisible();

  await page.getByLabel('Nama lengkap').fill(uat.applicant.name);
  await page.getByLabel('NIK').fill(uat.applicant.nik);
  await page.getByLabel('Nomor Kartu Keluarga').fill(uat.applicant.kk);
  await page.getByLabel('Nomor WhatsApp').fill(uat.applicant.phone);
  await page.getByRole('button', { name: 'Lanjut' }).click();

  await page.getByLabel('Alamat domisili').fill('Alamat sintetis UAT M6');
  await page.getByLabel('RT / RW').fill('00 / 00');
  await page.getByLabel('Kelurahan').fill('Kelurahan UAT');
  await page.getByRole('button', { name: 'Lanjut' }).click();

  await page.getByLabel('Uraian kebutuhan').fill('Pengujian alur intake sintetis M6.');
  await page.getByRole('button', { name: 'Lanjut' }).click();

  const fakePdf = Buffer.from('%PDF-1.4\nM6 UAT synthetic document\n%%EOF\n');
  await page.getByLabel('Unggah KTP').setInputFiles({
    name: 'm6-uat-synthetic-identity.pdf',
    mimeType: 'application/pdf',
    buffer: fakePdf,
  });
  await page.getByLabel('Unggah Kartu Keluarga').setInputFiles({
    name: 'm6-uat-synthetic-family.pdf',
    mimeType: 'application/pdf',
    buffer: fakePdf,
  });
  await page.getByRole('button', { name: 'Lanjut' }).click();

  await page.getByRole("checkbox", { name: /menyatakan data.*benar/i }).check();
  await page.getByRole('button', { name: 'Kirim pengajuan' }).click();
  await expect(page.getByText('Pengajuan berhasil diterima', { exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Simpan nomor berkas Anda' })).toBeVisible();

  const fileNumber = (await page.locator('section').getByText('Nomor registrasi').locator('..').locator('p.font-mono').textContent())?.trim() ?? '';
  expect(fileNumber).toMatch(/^[A-Z0-9/-]{6,40}$/);

  await page.goto('/cek-pengajuan');
  await page.getByLabel('Nomor berkas, NIK, atau nomor WhatsApp').fill(fileNumber);
  await page.getByRole('button', { name: 'Lacak pengajuan' }).click();
  await expect(page.getByText('Ringkasan pengajuan')).toBeVisible();
  await expect(page.getByText(fileNumber, { exact: true })).toBeVisible();
});
