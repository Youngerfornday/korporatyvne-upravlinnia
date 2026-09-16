import { defineConfig, devices } from '@playwright/test';
import { fileURLToPath } from 'node:url';

/**
 * E2E сторінок сайту: npm run test:e2e. Playwright сам збирає сайт у dist-e2e/ з фікстурним банком
 * тесту теми 1 (KU_E2E_BANK=1, e2e/site/astro.config.mjs) і піднімає `astro preview` на окремому порту.
 * Браузер — `npx playwright install chromium`.
 */
export const PREVIEW_PORT = 4322;
export const BASE_PATH = '/korporatyvne-upravlinnia/';
export const BASE_URL = `http://localhost:${PREVIEW_PORT}${BASE_PATH}`;
const PROJECT_ROOT = fileURLToPath(new URL('../../', import.meta.url));
const E2E_ASTRO_CONFIG = 'e2e/site/astro.config.mjs';

export default defineConfig({
  testDir: '.',
  testMatch: /.*\.spec\.ts/,
  timeout: 45_000,
  retries: process.env['CI'] ? 1 : 0,
  reporter: [['list']],
  use: { baseURL: BASE_URL, trace: 'retain-on-failure', locale: 'uk-UA' },
  webServer: {
    command: `npx astro build --config ${E2E_ASTRO_CONFIG} && npx astro preview --config ${E2E_ASTRO_CONFIG} --port ${PREVIEW_PORT} --ignore-lock`,
    cwd: PROJECT_ROOT,
    // ASTRO_PREVIEW_BACKGROUND вимикає автозапуск preview у фоні (Astro робить так в агентних середовищах); --ignore-lock дозволяє другий сервер поруч із dist/.
    env: { KU_E2E_BANK: '1', ASTRO_PREVIEW_BACKGROUND: '0' },
    url: BASE_URL,
    reuseExistingServer: !process.env['CI'],
    timeout: 180_000,
  },
  projects: [
    { name: 'desktop-1440', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } },
    { name: 'mobile-390', use: { ...devices['Desktop Chrome'], viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } },
  ],
});
