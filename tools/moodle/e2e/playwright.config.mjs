// Playwright для спайку Moodle: тести йдуть строго послідовно (01 - відновлення, 02 - перевірки курсу),
// бо другий файл працює з курсом, який відновив перший.
import { defineConfig } from '@playwright/test';
import { SCREEN_DIR, RESULTS_DIR, VERIFY_URL } from './lib/config.mjs';

export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 10 * 60 * 1000,
  expect: { timeout: 15 * 1000 },
  outputDir: RESULTS_DIR,
  reporter: [['list'], ['json', { outputFile: `${SCREEN_DIR}/../playwright-report.json` }]],
  use: {
    baseURL: VERIFY_URL,
    locale: 'uk-UA',
    viewport: { width: 1280, height: 900 },
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    actionTimeout: 30 * 1000,
    navigationTimeout: 60 * 1000,
  },
});
