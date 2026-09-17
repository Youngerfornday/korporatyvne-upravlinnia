// Перевірка пакета SCORM тренажера в курсі KU-SCORM-CHECK (готує ../scorm-check.sh). Один послідовний сценарій.
import { defineConfig } from '@playwright/test';
import { OUT_DIR, RESULTS_DIR, VERIFY_URL } from './lib/config.mjs';

export default defineConfig({
  testDir: './tests-scorm',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 10 * 60 * 1000,
  expect: { timeout: 30 * 1000 },
  outputDir: `${RESULTS_DIR}-scorm`,
  reporter: [['list'], ['json', { outputFile: `${OUT_DIR}/scorm-check-playwright.json` }]],
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
