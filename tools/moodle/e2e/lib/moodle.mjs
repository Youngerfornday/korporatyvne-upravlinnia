// Спільні дії в Moodle: вхід, завантаження файлу через filepicker, CLI-помічник у контейнері verify.
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect } from '@playwright/test';
import { MOODLE_DIR, OUT_DIR, SCREEN_DIR, USER_PASS } from './config.mjs';

const HELPER_TIMEOUT_MS = 120 * 1000;

mkdirSync(SCREEN_DIR, { recursive: true });

export async function shot(page, name) {
  await page.screenshot({ path: resolve(SCREEN_DIR, `${name}.png`), fullPage: true });
}

export function saveEvidence(name, data) {
  writeFileSync(resolve(OUT_DIR, `${name}.json`), `${JSON.stringify(data, null, 2)}\n`);
}

/** Виконує spike/verify-helper.php у контейнері verify і повертає розібраний JSON. */
export function helper(command, args = {}) {
  const cliArgs = Object.entries(args).map(([key, value]) => `--${key}=${value}`);
  const output = execFileSync('docker', [
    'compose', '--project-directory', MOODLE_DIR, '-f', resolve(MOODLE_DIR, 'compose.yaml'),
    '--env-file', resolve(MOODLE_DIR, 'env/verify.env'),
    'exec', '-T', 'moodle', 'php', '/work/spike/verify-helper.php', command, ...cliArgs,
  ], { encoding: 'utf8', timeout: HELPER_TIMEOUT_MS });
  return JSON.parse(output.slice(output.indexOf('{')));
}

/**
 * Вхід через форму. Сторінка входу 5.2 після завантаження ще виконує фонові запити;
 * відправка форми до їх завершення дає «Unable to log in» (logintoken не збігається із сесією).
 */
export async function login(page, username) {
  await page.context().clearCookies();
  await page.goto('/login/index.php', { waitUntil: 'networkidle' });
  await page.fill('#username', username);
  await page.fill('#password', USER_PASS);
  await Promise.all([page.waitForURL((url) => !url.pathname.startsWith('/login/')), page.click('#loginbtn')]);
}

export async function sesskey(page) {
  return page.evaluate(() => window.M.cfg.sesskey);
}

/**
 * Завантажує локальний файл у filepicker форми (кнопка «Виберіть файл...» -> «Завантажити файл»).
 * Форма репозиторію перемальовується асинхронно; якщо файл обрано до цього, Moodle відповідає
 * «Файли не долучено», тому чекаємо на форму й перевіряємо, що input справді містить файл.
 */
export async function uploadWithFilepicker(page, chooseButtonName, filePath) {
  await page.click(`input[name="${chooseButtonName}"]`);
  const dialog = page.locator('.file-picker.fp-generallayout:visible');
  await expect(dialog).toBeVisible();
  await dialog.locator('.fp-repo-name', { hasText: 'Завантажити файл' }).click();
  const form = dialog.locator('.fp-upload-form');
  await expect(form).toBeVisible();
  await page.waitForLoadState('networkidle');
  const input = form.locator('input[type=file][name=repo_upload_file]');
  await input.setInputFiles(filePath);
  await expect.poll(() => input.evaluate((el) => el.files.length)).toBe(1);
  await form.locator('.fp-upload-btn').click();
  await expect(dialog).toBeHidden({ timeout: 60 * 1000 });
}

/** Натискає кнопку, що відправляє форму, і чекає завантаження наступної сторінки. */
export async function submitAndWait(page, locator) {
  await Promise.all([page.waitForEvent('load'), locator.click()]);
  await page.waitForLoadState('domcontentloaded');
}

export async function waitFor(check, { timeoutMs, intervalMs = 5000, label }) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const result = check();
    if (result) {
      return result;
    }
    if (Date.now() > deadline) {
      throw new Error(`Timed out waiting for ${label}`);
    }
    await new Promise((done) => setTimeout(done, intervalMs));
  }
}
