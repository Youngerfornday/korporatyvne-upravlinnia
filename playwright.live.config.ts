import { defineConfig, devices } from '@playwright/test';

/** Смоук-перевірка живого сайту на GitHub Pages: npm run test:live (адресу можна змінити через LIVE_URL). */
export const LIVE_URL = process.env['LIVE_URL'] ?? 'https://youngerfornday.github.io/korporatyvne-upravlinnia/';

export default defineConfig({
  testDir: './e2e/live',
  timeout: 30_000,
  retries: 2,
  reporter: [['list']],
  use: { baseURL: LIVE_URL, trace: 'retain-on-failure' },
  projects: [
    { name: 'desktop-1440', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } },
    { name: 'mobile-390', use: { ...devices['Desktop Chrome'], viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } },
  ],
});
