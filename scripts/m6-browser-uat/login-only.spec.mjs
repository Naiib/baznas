import { test, expect, uat } from './browser-fixtures.mjs';
import { signIn } from './browser-helpers.mjs';

for (const [role, account] of [['staff', uat.staff], ['finance', uat.finance]]) {
  test(`${role} synthetic account can authenticate without case or finance mutations`, async ({ page }) => {
    const blockedMutations = [];
    await page.route('**/api/**', async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      const isLogin = url.pathname === '/api/auth/login' && request.method() === 'POST';
      if (request.method() !== 'GET' && !isLogin) {
        blockedMutations.push({ method: request.method(), path: url.pathname });
        await route.abort();
        return;
      }
      await route.continue();
    });

    await signIn(page, account);
    await expect(page).not.toHaveURL(/\/login(?:\?|$)/);
    await expect(page.getByLabel('Email / Username Amil')).toHaveCount(0);
    await expect(page.getByLabel('Kata Sandi')).toHaveCount(0);
    expect(blockedMutations).toEqual([]);
  });
}

test('staff synthetic account can log out and loses access to protected workspace', async ({ page }) => {
  await signIn(page, uat.staff);
  await page.goto('/penyaluran/mustahik');
  await page.getByRole('button', { name: 'Profil amil' }).click();
  await page.getByRole('menuitem', { name: 'Keluar' }).click();
  await expect(page).toHaveURL(/\/login(?:\?|$)/);
  await expect.poll(() => page.evaluate(() => ({
    token: localStorage.getItem('baznas_auth_token'),
    user: localStorage.getItem('baznas_auth_user'),
  }))).toEqual({ token: null, user: null });

  await page.goto('/penyaluran/mustahik');
  await expect(page).toHaveURL(/\/login(?:\?|$)/);
});
