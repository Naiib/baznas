import { defineConfig } from '@playwright/test';
import { resolveUatConfig } from './safety.mjs';

const uat = resolveUatConfig(process.env);

export default defineConfig({
  testDir: '.',
  testMatch: '**/*.spec.mjs',
  fullyParallel: false,
  forbidOnly: true,
  retries: 0,
  workers: 1,
  timeout: 90_000,
  globalTimeout: 15 * 60_000,
  reporter: 'list',
  outputDir: '.artifacts',
  use: {
    baseURL: uat.baseUrl.href,
    browserName: 'chromium',
    headless: true,
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
    locale: 'id-ID',
    screenshot: 'off',
    video: 'off',
    trace: 'off',
  },
});
