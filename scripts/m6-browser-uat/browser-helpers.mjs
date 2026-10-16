import { expect, uat } from './browser-fixtures.mjs';
import { readFile } from 'node:fs/promises';

export async function signIn(page, account) {
  await page.goto('/login');
  await page.getByLabel('Email / Username Amil').fill(account.username);
  await page.getByLabel('Kata Sandi').fill(account.password);
  await page.getByRole('button', { name: 'Masuk ke Sistem' }).click();
  await expect(page).not.toHaveURL(/\/login(?:\?|$)/);
}

export async function openSyntheticCase(page, name) {
  await page.goto('/penyaluran/mustahik');
  await page.getByRole('textbox', { name: 'Filter antrean' }).fill(name);
  await page.getByRole('button', { name: `Pilih ${name}` }).click();
  await expect(page.getByText(name, { exact: true }).first()).toBeVisible();
}

export async function expectDownloadedPdf(page, button, { expectedMime } = {}) {
  let responseMime;
  const captureResponse = (response) => {
    if (expectedMime && /\/receipt(?:\?|$)/.test(new URL(response.url()).pathname)) {
      responseMime = response.headers()['content-type']?.split(';')[0]?.trim().toLowerCase();
    }
  };
  page.on('response', captureResponse);
  const downloadStarted = page.waitForEvent('download');
  await button.click();
  const download = await downloadStarted;
  expect(download.suggestedFilename()).toMatch(/\.pdf$/i);
  const path = await download.path();
  expect(path).toBeTruthy();
  const signature = await readFile(path).then((bytes) => bytes.subarray(0, 5).toString('ascii'));
  expect(signature).toBe('%PDF-');
  if (expectedMime) expect(responseMime).toBe(expectedMime);
  page.off('response', captureResponse);
}
