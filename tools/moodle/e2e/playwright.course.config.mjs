// Перевірка зібраного курсу: відновлення .mbz викладачем у чистий інстанс verify і перевірки
// вмісту. Тести йдуть строго послідовно: другий файл працює з курсом, який відновив перший.
import { defineConfig } from '@playwright/test';
import { OUT_DIR, RESULTS_DIR, VERIFY_URL } from './lib/config.mjs';

export default defineConfig({
  testDir: './tests-course',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 15 * 60 * 1000,
  expect: { timeout: 20 * 1000 },
  outputDir: `${RESULTS_DIR}-course`,
  reporter: [['list'], ['json', { outputFile: `${OUT_DIR}/build-verify-playwright.json` }]],
  use: {
    baseURL: VERIFY_URL,
    locale: 'uk-UA',
    viewport: { width: 1280, height: 900 },
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    actionTimeout: 60 * 1000,
    navigationTimeout: 90 * 1000,
  },
});
