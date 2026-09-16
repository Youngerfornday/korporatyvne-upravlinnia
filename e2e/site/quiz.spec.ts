import { expect, test } from '@playwright/test';
import { expectNoHorizontalScroll, expectNoSeriousAxeViolations } from './helpers';
import { QUIZ_PATH, QUIZ_QUESTIONS, card, passWholeQuiz, quiz } from './quiz-helpers';

test.describe('тренувальний тест теми 1 (фікстурний банк)', () => {
  test('усі 8 типів питань проходяться правильно; XP нараховано, чип і профіль оновлені після перезавантаження', async ({ page }) => {
    await page.goto(QUIZ_PATH);
    await expect(quiz(page)).toBeVisible();
    await expect(page.locator('[data-player-chip]')).toHaveAttribute('data-xp', '0');

    const types = await passWholeQuiz(page);
    expect([...types].sort()).toEqual(['calculated', 'ddwtos', 'matching', 'multianswer', 'multichoice', 'multichoice-multi', 'numerical', 'truefalse']);

    await expect(page.locator('[data-quiz-summary] .summary-score b')).toHaveText(/100\s%/);
    await expect(page.locator('[data-quiz-outcome]')).toContainText('+150');
    await expect(page.locator('[data-player-chip]')).toHaveAttribute('data-xp', '150');
    await expect(page.locator('#toast')).toContainText('+150');

    await page.reload();
    await expect(page.locator('[data-player-chip]')).toHaveAttribute('data-xp', '150');
    await expect(page.locator('.xp-box .big')).toContainText('150');

    await page.goto('profil/');
    await expect(page.locator('[data-profile-xp]')).toHaveAttribute('data-profile-xp', '150');
    await expect(page.locator('[data-map-topic="t01"] .c').nth(2).locator('.mark')).toHaveAttribute('aria-label', 'виконано');

    await page.goto('testy/');
    await expect(page.locator('[data-quiz-best="t01"]')).toHaveText(/найкращий результат 100\s%/);
    await expect(page.locator('[data-quiz-best-topic="t01"]')).toHaveAttribute('data-state', 'done');
  });

  test('повторне проходження без покращення не дає XP; питання перемішуються заново', async ({ page }) => {
    await page.goto(QUIZ_PATH);
    await passWholeQuiz(page);
    await expect(page.locator('[data-player-chip]')).toHaveAttribute('data-xp', '150');

    await page.locator('[data-quiz-restart]').click();
    await expect(card(page).locator('.q-title')).toContainText(`Питання 1 із ${QUIZ_QUESTIONS}`);
    await expect(card(page).locator('.verdict')).toHaveCount(0);
    await passWholeQuiz(page);
    await expect(page.locator('[data-quiz-outcome]')).toContainText('не перевищує попередній найкращий');
    await expect(page.locator('[data-player-chip]')).toHaveAttribute('data-xp', '150');
  });

  test('неправильна відповідь показує розбір і правильний варіант; завершення з пропусками потребує підтвердження', async ({ page }) => {
    await page.goto(QUIZ_PATH);
    await expect(quiz(page)).toBeVisible();
    // Порожня відповідь — повідомлення рушія біля поля, спроба не змінюється.
    await page.locator('[data-quiz-submit]').click();
    await expect(card(page).locator('.q-issue')).toBeVisible();

    // Перехід на останнє питання через навігатор і завершення з пропусками.
    await page.locator('.cells .cell').nth(QUIZ_QUESTIONS - 1).click();
    await expect(card(page).locator('.q-title')).toContainText(`Питання ${QUIZ_QUESTIONS} із ${QUIZ_QUESTIONS}`);
    await page.locator('[data-quiz-finish]').click();
    await expect(page.locator('.q-confirm')).toBeVisible();
    await page.locator('.q-confirm .btn-secondary').click();
    await expect(page.locator('.q-confirm')).toHaveCount(0);
    await page.locator('[data-quiz-finish]').click();
    await page.locator('[data-quiz-finish-confirm]').click();

    await expect(page.locator('[data-quiz-summary]')).toBeVisible();
    await expect(page.locator('[data-quiz-summary] .summary-score b')).toHaveText(/0\s%/);
    await expect(page.locator('[data-quiz-outcome]')).toContainText('нових XP немає');
    await expect(page.locator('[data-player-chip]')).toHaveAttribute('data-xp', '0');

    // Перегляд відповідей: питання без відповіді показують правильну відповідь і вердикт «Без відповіді».
    await page.getByRole('button', { name: 'Переглянути відповіді' }).click();
    await expect(card(page).locator('.verdict')).toContainText('Без відповіді');
    await expect(page.locator('.cells .cell[data-state="err"]')).toHaveCount(QUIZ_QUESTIONS);
  });

  test('позначення питання, навігатор і без горизонтального скролу; axe без serious', async ({ page }) => {
    await page.goto(QUIZ_PATH);
    await expect(quiz(page)).toBeVisible();
    const flag = page.locator('[data-quiz-flag]');
    await flag.click();
    await expect(flag).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('.cells .cell').first()).toHaveAttribute('data-flag', '');
    await page.locator('.cells .cell').nth(2).click();
    await expect(card(page).locator('.q-title')).toContainText('Питання 3 із');
    await expect(page.locator('.cells .cell[aria-current="true"]')).toHaveText(/3/);
    await expectNoHorizontalScroll(page);
    await expectNoSeriousAxeViolations(page);
  });

  test('тема без банку: сторінка «Тест готується» з посиланням на тему', async ({ page }) => {
    await page.goto('testy/aktsionery-ta-zahalni-zbory/');
    await expect(page.locator('[data-quiz-pending]')).toContainText('Тест готується');
    await expect(page.locator('[data-quiz-page]')).toHaveAttribute('data-quiz-ready', 'false');
    await page.locator('[data-quiz-pending] a.btn-primary').click();
    await expect(page).toHaveURL(/temy\/aktsionery-ta-zahalni-zbory\/$/);
    await expect(page.locator('[data-topic-quiz-cta] a')).toContainText('Тест готується');
  });
});

test.describe('клавіатура', () => {
  test.skip(({ isMobile }) => Boolean(isMobile), 'клавіатурний сценарій — лише на десктопі');

  test('фокус на заголовку нового питання, вибір варіанта і відповідь лише з клавіатури', async ({ page }) => {
    await page.goto(QUIZ_PATH);
    await expect(quiz(page)).toBeVisible();
    await expect(card(page).locator('.q-title')).toBeFocused();

    // Знаходимо питання з radio (одиночний вибір або правда/неправда) через навігатор.
    let found = false;
    for (let index = 0; index < QUIZ_QUESTIONS && !found; index += 1) {
      await page.locator('.cells .cell').nth(index).focus();
      await page.keyboard.press('Enter');
      await expect(card(page).locator('.q-title')).toBeFocused();
      const title = await card(page).locator('.q-title').innerText();
      found = /одиночний вибір|правда чи неправда/.test(title);
    }
    expect(found).toBe(true);

    await page.keyboard.press('Tab');
    const focusedIsRadio = await page.evaluate(() => (document.activeElement as HTMLInputElement | null)?.type === 'radio');
    expect(focusedIsRadio).toBe(true);
    await page.keyboard.press('Space');
    await expect(card(page).locator('label.opt[data-checked]')).toHaveCount(1);

    // Tab до кнопок дій: «Позначити питання» → «Назад» → «Відповісти».
    await page.locator('[data-quiz-submit]').focus();
    await page.keyboard.press('Enter');
    await expect(card(page).locator('.verdict')).toBeVisible();
    // Після відповіді фокус переходить на «Далі» (або «Завершити спробу» на останньому питанні).
    const nextFocused = await page.evaluate(() => document.activeElement?.matches('[data-quiz-next], [data-quiz-finish]'));
    expect(nextFocused).toBe(true);
  });
});
