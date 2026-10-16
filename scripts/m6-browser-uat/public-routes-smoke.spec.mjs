import { test, expect } from "./browser-fixtures.mjs";

test("public intake and tracking pages load without login with visible keyboard focus", async ({ page }) => {
  await page.goto("/pengajuan");
  await expect(page.getByRole("heading", { name: /Permohonan bantuan yang mudah dipahami/ })).toBeVisible();
  await page.keyboard.press("Tab");
  await expect(page.locator(":focus-visible")).toBeVisible();

  await page.goto("/cek-pengajuan");
  await expect(page.getByRole("heading", { name: /Pantau status bantuan Anda/ })).toBeVisible();
  await expect(page.getByLabel("Nomor berkas, NIK, atau nomor WhatsApp")).toBeVisible();
});
