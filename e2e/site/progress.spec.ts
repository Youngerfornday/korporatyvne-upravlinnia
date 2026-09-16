import { expect, test } from '@playwright/test';

const STORAGE_KEY = 'ku:v1:progress';
const NOW = '2026-09-10T10:00:00.000Z';

const STATE = {
  schemaVersion: 2,
  updatedAt: NOW,
  xp: 250,
  xpLedger: { 'topic-read:t01': 100, 'quiz:t01-training': 150 },
  badges: {},
  recentEventIds: [],
  topics: { t01: { status: 'completed', updatedAt: NOW }, t02: { status: 'in-progress', updatedAt: NOW } },
  quizzes: { 't01-training': { attempts: 1, bestScore: 0.87, lastAttemptAt: NOW } },
  flashcards: {},
  activities: {},
};

test.describe('гідрація прогресу на головній, у модулі й у списку тем', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(
      ([key, value]) => {
        if (!localStorage.getItem(key as string)) localStorage.setItem(key as string, value as string);
      },
      [STORAGE_KEY, JSON.stringify(STATE)],
    );
  });

  test('головна: кворум, позиція, наступна тема, CTA «Продовжити», сходинки рівня', async ({ page }) => {
    await page.goto('');
    await expect(page.locator('[data-quorum-label]')).toHaveText('1 із 12 тем');
    await expect(page.locator('[data-quorum-cells] i[data-topic="t01"]')).toHaveAttribute('data-state', 'done');
    await expect(page.locator('[data-quorum-cells] i[data-topic="t02"]')).toHaveAttribute('data-state', 'doing');
    await expect(page.locator('[data-quorum-position]')).toHaveText('Модуль 1 · середина');
    await expect(page.locator('[data-quorum-next-title]')).toContainText('2.');
    await expect(page.locator('[data-quorum-next-link]')).toHaveAttribute('href', /modeli-ku-ta-mizhnarodni-standarty\/$/);
    await expect(page.locator('[data-continue-label]')).toHaveText('Продовжити: Тема 2');
    await expect(page.locator('[data-continue]')).toHaveAttribute('href', /modeli-ku-ta-mizhnarodni-standarty\/$/);
    await expect(page.locator('[data-agenda] a.topic[data-topic="t01"]')).toHaveAttribute('data-state', 'done');
    await expect(page.locator('[data-agenda] a.topic[data-topic="t01"] [data-topic-mark]')).toHaveAttribute('aria-label', 'Пройдено');
    await expect(page.locator('[data-topic-progress="t01"]')).toHaveText(/тест 87\s%/);
    await expect(page.locator('[data-module-progress="m1"]')).toHaveText('1 із 3');
    await expect(page.locator('[data-ladder] .rung[data-now]')).toHaveAttribute('data-level-id', 'shareholder');
    await expect(page.locator('[data-player-chip]')).toHaveAttribute('data-xp', '250');
  });

  test('сторінка модуля: метр і підпис пройдених тем', async ({ page }) => {
    await page.goto('moduli/m1/');
    await expect(page.locator('[data-module-progress-label]')).toHaveText('1 із 3');
    await expect(page.locator('[data-module-progress-meter]')).toHaveAttribute('aria-valuenow', '1');
    await expect(page.locator('a.topic[data-topic="t02"]')).toHaveAttribute('data-state', 'doing');
  });

  test('самоперевірка: подія ku:selfcheck з усіма відповідями дає 20 XP і тост; повтор — ні', async ({ page }) => {
    await page.goto('');
    const fire = () =>
      page.evaluate(() =>
        document.dispatchEvent(new CustomEvent('ku:selfcheck', { detail: { topic: 't03', question: 1, correct: true, answered: 2, total: 2 } })),
      );
    await fire();
    await expect(page.locator('[data-player-chip]')).toHaveAttribute('data-xp', '270');
    await expect(page.locator('#toast')).toContainText('+20');
    await fire();
    await expect(page.locator('[data-player-chip]')).toHaveAttribute('data-xp', '270');
    await page.reload();
    await expect(page.locator('[data-player-chip]')).toHaveAttribute('data-xp', '270');
    await expect(page.locator('[data-agenda] a.topic[data-topic="t03"]')).toHaveAttribute('data-state', 'doing');
  });
});

test('пошкоджений запис прогресу: сайт стартує з нуля, копія лишається в резервному ключі', async ({ page }) => {
  await page.addInitScript((key) => localStorage.setItem(key as string, '{"schemaVersion":2,"xp":"broken"'), STORAGE_KEY);
  await page.goto('');
  await expect(page.locator('[data-player-chip]')).toHaveAttribute('data-xp', '0');
  await expect(page.locator('#toast')).toContainText('не вдалося прочитати');
  expect(await page.evaluate(() => localStorage.getItem('ku:v1:progress-backup'))).toContain('broken');
});

test.describe('сторінка теми 1: читання й самоперевірка дають XP', () => {
  test('дочитування до кінця → 100 XP один раз; самоперевірка → ще 20; стан теми «пройдено» на головній', async ({ page }) => {
    await page.goto('temy/korporatsiia-i-korporatyvne-upravlinnia/');
    await expect(page.locator('[data-player-chip]')).toHaveAttribute('data-xp', '0');
    await expect(page.locator('[data-topic-xp-note]')).toHaveText('XP нараховуються після самоперевірки');

    await page.locator('[data-topic-article] .pager').scrollIntoViewIfNeeded();
    await expect(page.locator('[data-player-chip]')).toHaveAttribute('data-xp', '100');
    await expect(page.locator('#toast')).toContainText('+100');
    await expect(page.locator('[data-topic-xp-note]')).toContainText('Тему прочитано');

    const questions = page.locator('[data-selfcheck] .sc-q');
    const total = await questions.count();
    for (let index = 0; index < total; index += 1) await questions.nth(index).locator('.opt').first().click();
    await expect(page.locator('[data-player-chip]')).toHaveAttribute('data-xp', '120');
    await expect(page.locator('[data-topic-xp-note]')).toHaveText('XP за тему й самоперевірку нараховано');

    await page.reload();
    await page.locator('[data-topic-article] .pager').scrollIntoViewIfNeeded();
    await expect(page.locator('[data-player-chip]')).toHaveAttribute('data-xp', '120');

    await page.goto('');
    await expect(page.locator('[data-agenda] a.topic[data-topic="t01"]')).toHaveAttribute('data-state', 'done');
    await expect(page.locator('[data-quorum-label]')).toHaveText('1 із 12 тем');
    await expect(page.locator('[data-continue-label]')).toHaveText('Продовжити: Тема 2');
  });
});
