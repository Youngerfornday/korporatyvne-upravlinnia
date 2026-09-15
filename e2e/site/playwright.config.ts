import { defineConfig, devices } from '@playwright/test';

/**
 * E2E сторінок сайту проти локального `astro preview` (dist/): npm run test:e2e.
 * Перед запуском потрібен `npm run build`; браузер — `npx playwright install chromium`.
 */
export const PREVIEW_PORT = 4321;
export const BASE_PATH = '/korporatyvne-upravlinnia/';
export const BASE_URL = `http://localhost:${PREVIEW_PORT}${BASE_PATH}`;

export default defineConfig({
  testDir: '.',
  testMatch: /.*\.spec\.ts/,
  timeout: 30_000,
  retries: process.env['CI'] ? 1 : 0,
  reporter: [['list']],
  use: { baseURL: BASE_URL, trace: 'retain-on-failure', locale: 'uk-UA' },
  webServer: {
    command: `npx astro preview --port ${PREVIEW_PORT}`,
    url: BASE_URL,
    reuseExistingServer: !process.env['CI'],
    timeout: 60_000,
  },
  projects: [
    { name: 'desktop-1440', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } },
    { name: 'mobile-390', use: { ...devices['Desktop Chrome'], viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } },
  ],
});
