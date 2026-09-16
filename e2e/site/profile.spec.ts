import { expect, test, type Page } from '@playwright/test';
import { expectNoHorizontalScroll, expectNoSeriousAxeViolations } from './helpers';

const STORAGE_KEY = 'ku:v1:progress';
const NOW = '2026-09-10T10:00:00.000Z';

/** Валідний стан схеми v2 (src/engines/progress/state.ts): 640 XP, тема 1 прочитана, тест теми 1 на 100 %. */
function seededState() {
  return {
    schemaVersion: 2,
    updatedAt: NOW,
    xp: 640,
    xpLedger: { 'topic-read:t01': 100, 'self-check:t01': 20, 'quiz:t01-training': 150 },
    badges: {},
    recentEventIds: [],
    topics: { t01: { status: 'completed', updatedAt: NOW }, t02: { status: 'in-progress', updatedAt: NOW } },
    quizzes: { 't01-training': { attempts: 2, bestScore: 1, lastAttemptAt: NOW } },
    flashcards: {},
    activities: {},
  };
}

async function seedProgress(page: Page): Promise<void> {
  await page.addInitScript(
    ([key, value]) => {
      if (!localStorage.getItem(key as string)) localStorage.setItem(key as string, value as string);
    },
    [STORAGE_KEY, JSON.stringify(seededState())],
  );
}

test.describe('профіль гравця', () => {
  test('рівень, XP, метр, бейджі й карта зі збереженого стану; чип у шапці збігається', async ({ page }) => {
    await seedProgress(page);
    await page.goto('profil/');
    await expect(page.locator('[data-profile-level]')).toHaveText('Міноритарій');
    await expect(page.locator('[data-profile-xp]')).toHaveAttribute('data-profile-xp', '640');
    await expect(page.locator('.prof-head .lvl')).toHaveText('Ваш рівень — 2 із 5');
    await expect(page.locator('.xp-block .to')).toContainText('560');
    await expect(page.locator('[data-levels] .level[data-now]')).toHaveAttribute('data-level-id', 'minority');
    await expect(page.locator('[data-badges-earned]')).toContainText('Здобуто 0 із 9');
    await expect(page.locator('[data-badge]')).toHaveCount(9);
    await expect(page.locator('[data-map-topic="t01"] .c').nth(0).locator('.mark')).toHaveAttribute('aria-label', 'виконано');
    await expect(page.locator('[data-map-topic="t02"] .c').nth(0).locator('.mark')).toHaveAttribute('aria-label', 'у процесі');
    await expect(page.locator('[data-map-topic="t03"] .c').nth(0).locator('.mark')).toHaveAttribute('aria-label', 'не виконано');
    await expect(page.locator('[data-player-chip]')).toHaveAttribute('data-xp', '640');
    await expect(page.locator('[data-player-level]')).toHaveText('Міноритарій');
    await expectNoHorizontalScroll(page);
    await expectNoSeriousAxeViolations(page);
  });

  test('експорт → скидання з підтвердженням → імпорт відновлює стан; пошкоджений код відхиляється українською', async ({ page }) => {
    await seedProgress(page);
    await page.goto('profil/');
    const code = await page.locator('[data-progress-code]').inputValue();
    expect(code.startsWith('KUP1.')).toBe(true);

    await page.locator('[data-progress-reset]').click();
    const dialog = page.locator('dialog.confirm');
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText('Скинути прогрес?');
    await page.locator('[data-confirm-cancel]').click();
    await expect(dialog).toBeHidden();
    await expect(page.locator('[data-profile-level]')).toHaveText('Міноритарій');

    await page.locator('[data-progress-reset]').click();
    await page.locator('[data-confirm-ok]').click();
    await expect(page.locator('[data-profile-level]')).toHaveText('Акціонер');
    await expect(page.locator('[data-profile-xp]')).toHaveAttribute('data-profile-xp', '0');
    await expect(page.locator('[data-player-chip]')).toHaveAttribute('data-xp', '0');
    expect(await page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY)).toBeNull();

    await page.locator('[data-progress-import]').fill('KUP1.zipsuty-kod');
    await page.locator('[data-progress-import-btn]').click();
    await expect(page.locator('#code-in-error')).toContainText('Код пошкоджений');
    await expect(page.locator('[data-profile-level]')).toHaveText('Акціонер');

    await page.locator('[data-progress-import]').fill(`  ${code}\n`);
    await page.locator('[data-progress-import-btn]').click();
    await expect(dialog).toContainText('Замінити прогрес?');
    await expect(dialog).toContainText('640');
    await page.locator('[data-confirm-ok]').click();
    await expect(page.locator('[data-profile-level]')).toHaveText('Міноритарій');
    await expect(page.locator('[data-player-chip]')).toHaveAttribute('data-xp', '640');

    await page.reload();
    await expect(page.locator('[data-profile-xp]')).toHaveAttribute('data-profile-xp', '640');
  });

  test('без localStorage (приватний режим): сторінка працює, профіль пояснює, що прогрес лише до закриття вкладки', async ({ page }) => {
    await page.addInitScript(() => {
      Storage.prototype.setItem = () => {
        throw new DOMException('QuotaExceededError');
      };
    });
    await page.goto('profil/');
    await expect(page.locator('[data-profile-level]')).toHaveText('Акціонер');
    await expect(page.locator('.prof-head .sub')).toContainText('Сховище браузера недоступне');
    await expect(page.locator('[data-player-summary]')).toContainText('недоступне');
  });
});
