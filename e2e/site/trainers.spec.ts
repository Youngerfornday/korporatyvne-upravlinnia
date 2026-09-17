import { expect, test } from '@playwright/test';
import { DEFAULT_MEETING_RULES, distributeProfit, guaranteedSeats, minimumAbove, minimumStakeForSeats, type MajorityKind } from '../../src/engines/calculators';
import { expectNoHorizontalScroll, expectNoSeriousAxeViolations } from './helpers';
import { formatPercent } from '../../src/engines/shared/number-format';
import { P01_PATH, answerCurrentFeature, chip, matrix, matrixTotals, openTaskMode, taskPanel, taskValue, uk } from './trainers-helpers';

const { features: FEATURES, items: MATRIX_ITEMS } = matrixTotals();
const GRADED_WRONG = 4;
const GRADED_RIGHT = MATRIX_ITEMS - GRADED_WRONG;
const GRADED_XP = Math.round((60 * GRADED_RIGHT) / MATRIX_ITEMS);
const GRADED_PERCENT = formatPercent(GRADED_RIGHT / MATRIX_ITEMS);
/** Рубрика П1 (course.yaml): не менше 90 % — 1 бал, 60–89 % — 0,5. */
const GRADED_MARK = GRADED_RIGHT * 100 >= 90 * MATRIX_ITEMS ? '1 бал з 1' : '0,5 бала з 1';

test.describe('практична 1: тренажер-матриця', () => {
  test.setTimeout(150_000);

  test('навчальна спроба з розбором → оцінювана без розбору → бал за рубрикою і XP, що зберігаються після перезавантаження', async ({ page }) => {
    await page.goto(P01_PATH);
    await expect(matrix(page)).toHaveAttribute('data-stage', 'learning');
    await expect(chip(page)).toHaveAttribute('data-xp', '0');

    // Спроба 1: після перевірки кожної ознаки відкривається розбір кожної клітинки з джерелом.
    for (let feature = 0; feature < FEATURES; feature += 1) {
      await answerCurrentFeature(page);
      await matrix(page).locator('[data-matrix-check]').click();
      await expect(matrix(page).locator('[data-matrix-review]')).toHaveCount(4);
      await expect(matrix(page).locator('[data-matrix-feature]')).toBeFocused();
      if (feature === 0) {
        await expect(matrix(page).locator('[data-matrix-card]').first()).toHaveAttribute('data-state', 'right');
        await expect(matrix(page).locator('[data-matrix-review] .msrc a').first()).toHaveAttribute('href', /^https:\/\//);
        await expect(matrix(page).locator('[data-matrix-live]')).toContainText('правильно 4 з 4');
      }
      if (feature < FEATURES - 1) await matrix(page).locator('[data-matrix-next]').click();
    }
    await matrix(page).locator('[data-matrix-finish]').click();
    await expect(matrix(page)).toHaveAttribute('data-stage', 'learning-done');
    await expect(page.locator('[data-matrix-stage-heading]')).toBeFocused();
    await expect(matrix(page).locator('[data-matrix-learning-done]')).toContainText(`${MATRIX_ITEMS} з ${MATRIX_ITEMS}`);
    await expect(chip(page)).toHaveAttribute('data-xp', '0');

    // Спроба 2: розбору немає до завершення; по одній хибній відповіді в перших чотирьох ознаках.
    await matrix(page).locator('[data-matrix-start-graded]').click();
    await expect(matrix(page)).toHaveAttribute('data-stage', 'graded');
    await expect(page.locator('[data-matrix-stage-heading]')).toBeFocused();
    await expect(page.locator('[data-matrix-stage-heading]')).toHaveText('Спроба 2 · оцінювана');
    for (let feature = 0; feature < FEATURES; feature += 1) {
      await answerCurrentFeature(page, feature < GRADED_WRONG ? 1 : 0);
      await expect(matrix(page).locator('[data-matrix-review]')).toHaveCount(0);
      if (feature < FEATURES - 1) await matrix(page).locator('[data-matrix-next]').click();
    }
    await matrix(page).locator('[data-matrix-finish]').click();

    await expect(matrix(page)).toHaveAttribute('data-stage', 'result');
    await expect(page.locator('[data-matrix-stage-heading]')).toBeFocused();
    await expect(page.locator('[data-matrix-percent]')).toHaveText(GRADED_PERCENT);
    await expect(page.locator('[data-matrix-mark]')).toContainText(GRADED_MARK);
    await expect(page.locator('[data-matrix-outcome]')).toContainText(`+${GRADED_XP}`);
    await expect(chip(page)).toHaveAttribute('data-xp', String(GRADED_XP));

    await page.reload();
    await expect(matrix(page)).toHaveAttribute('data-stage', 'recorded');
    await expect(page.locator('[data-matrix-recorded-result]')).toHaveText(`${GRADED_RIGHT} з ${MATRIX_ITEMS} (${GRADED_PERCENT}) — ${GRADED_MARK}`);
    await expect(chip(page)).toHaveAttribute('data-xp', String(GRADED_XP));

    // Тренувальний повтор не змінює результат і не дає XP.
    await page.locator('[data-matrix-practice]').click();
    await expect(matrix(page)).toHaveAttribute('data-stage', 'learning');
    await expect(matrix(page)).toHaveAttribute('data-practice', '');

    await page.goto('profil/');
    await expect(page.locator('[data-map-topic="t01"] [data-practicum-state]')).toHaveAttribute('data-practicum-state', 'done');
  });

  test('клавіатура: перевірка без відповідей показує помилку рушія; перетягування картки на модель — альтернатива списку', async ({ page, isMobile }) => {
    await page.goto(P01_PATH);
    const firstSelect = matrix(page).locator('[data-matrix-card] select').first();
    if (!isMobile) {
      // Зони моделей і перша картка в одному екрані: перетягування без прокручування посеред жесту.
      await matrix(page).locator('[data-matrix-feature]').scrollIntoViewIfNeeded();
      const card = matrix(page).locator('[data-matrix-card]').first();
      await card.locator('.mcard-n').dragTo(matrix(page).locator('[data-drop-model="german"]'));
      await expect(firstSelect).toHaveValue('german');
      await expect(matrix(page).locator('[data-drop-model="german"]')).toContainText('картки 1');
    }

    const check = matrix(page).locator('[data-matrix-check]');
    await check.focus();
    await page.keyboard.press('Enter');
    await expect(matrix(page).locator('[data-matrix-issue]')).toContainText('Зіставте усі формулювання');

    await firstSelect.focus();
    await expect(firstSelect).toBeFocused();

    await answerCurrentFeature(page);
    await check.focus();
    await page.keyboard.press('Enter');
    await expect(matrix(page).locator('[data-matrix-feature]')).toBeFocused();
    await expect(matrix(page).locator('[data-matrix-nav="0"]')).toHaveAttribute('data-state', 'ok');
    await page.keyboard.press('Tab');
    await expect(page.locator(':focus')).toHaveCount(1);
  });

  test('завдання «визнач модель»: помилка без вибору, розбір ключових ознак після перевірки', async ({ page }) => {
    await page.goto(P01_PATH);
    const task = page.locator('[data-company="volkswagen"]');
    await task.locator('[data-company-check]').click();
    await expect(task.locator('[data-field-error]')).toContainText('Оберіть модель');
    await task.getByRole('radio', { name: 'Німецька' }).check();
    await task.getByRole('checkbox', { name: 'Структура власності' }).check();
    await task.getByRole('checkbox', { name: 'Будова ради' }).check();
    await task.locator('[data-company-check]').click();
    await expect(task).toHaveAttribute('data-state', 'right');
    await expect(task.locator('[data-company-review] li')).toHaveCount(3);
  });

  test('сторінка практичної: рубрика, есе з підказками, дані; axe без serious і без горизонтального скролу', async ({ page }) => {
    await page.goto(P01_PATH);
    await expect(page.locator('table.rubric tbody tr')).toHaveCount(3);
    await expect(page.locator('#ese .essay-prompt')).toContainText('Закону № 2465-IX');
    await page.locator('[data-essay-hints] summary').click();
    await expect(page.locator('[data-essay-hints] ol li').first()).toBeVisible();
    await answerCurrentFeature(page, 1);
    await matrix(page).locator('[data-matrix-check]').click();
    await expect(matrix(page).locator('[data-matrix-card][data-state="wrong"]')).toHaveCount(1);
    await expectNoHorizontalScroll(page);
    await expectNoSeriousAxeViolations(page);
  });
});

function requiredVotes(kind: MajorityKind, voting: number, registered: number): number {
  const threshold = DEFAULT_MEETING_RULES.majorities[kind];
  return minimumAbove(threshold.base === 'total' ? voting : registered, threshold);
}

test.describe('тренажер «Кворум і голосування»', () => {
  test('розрахунок: «1,5» — помилка рушія біля поля; 10 000 з 5 000 — кворуму немає, поріг 5 001', async ({ page }) => {
    await page.goto('trenazhery/kvorum/');
    const form = page.locator('[data-calc-form]');
    await form.getByLabel('Голосуючі акції, що враховуються в кворумі').fill('1,5');
    await form.locator('[data-calc-submit]').click();
    const field = form.locator('[data-field="votingShares"]');
    await expect(field.locator('[data-field-error]')).toContainText('має бути цілим числом');
    await expect(field.locator('input')).toHaveAttribute('aria-invalid', 'true');
    await expect(field.locator('input')).toBeFocused();

    await field.locator('input').fill('10 000');
    await page.keyboard.press('Enter');
    await expect(page.locator('[data-verdict="quorum"]')).toHaveAttribute('data-state', 'err');
    await expect(page.locator('[data-steps="quorum"]')).toContainText(/5\s001/);
    await expectNoHorizontalScroll(page);
    await expectNoSeriousAxeViolations(page);
  });

  test('задача: хибна відповідь без XP, новий варіант з правильною відповіддю — 60 XP; вкладки перемикаються стрілками', async ({ page }) => {
    await page.goto('trenazhery/kvorum/');
    await page.getByRole('tab', { name: 'Розрахунок' }).focus();
    await page.keyboard.press('ArrowRight');
    await expect(page.getByRole('tab', { name: 'Задача' })).toBeFocused();
    await expect(page.getByRole('tab', { name: 'Задача' })).toHaveAttribute('aria-selected', 'true');

    const voting = await taskValue(page, 'votingShares');
    const registered = await taskValue(page, 'registeredShares');
    const required = minimumAbove(voting, DEFAULT_MEETING_RULES.quorum);
    await taskPanel(page).getByRole('radio', { name: registered >= required ? 'Ні' : 'Так' }).check();
    await taskPanel(page).getByLabel('Мінімум зареєстрованих акцій для кворуму').fill(String(required - 1));
    await taskPanel(page).getByLabel('Мінімум голосів «за» для рішення').fill('1');
    await taskPanel(page).locator('[data-task-check]').click();
    await expect(taskPanel(page).locator('[data-task-result]')).toHaveAttribute('data-solved', 'false');
    await expect(taskPanel(page).locator('[data-task-outcome]')).toContainText('XP не нараховано');
    await expect(taskPanel(page).locator('[data-steps="solution"]')).toBeVisible();
    await expect(chip(page)).toHaveAttribute('data-xp', '0');

    await taskPanel(page).locator('[data-task-next]').click();
    await expect(taskPanel(page).locator('[data-task-heading]')).toBeFocused();
    await expect(taskPanel(page).locator('[data-task-heading]')).toHaveText('Варіант 2');
    const voting2 = await taskValue(page, 'votingShares');
    const registered2 = await taskValue(page, 'registeredShares');
    const kind = (await taskPanel(page).locator('[data-task-majority]').getAttribute('data-task-majority')) as MajorityKind;
    const required2 = minimumAbove(voting2, DEFAULT_MEETING_RULES.quorum);
    await taskPanel(page).getByRole('radio', { name: registered2 >= required2 ? 'Так' : 'Ні' }).check();
    await taskPanel(page).getByLabel('Мінімум зареєстрованих акцій для кворуму').fill(String(required2));
    await taskPanel(page).getByLabel('Мінімум голосів «за» для рішення').fill(String(requiredVotes(kind, voting2, registered2)));
    await page.keyboard.press('Enter');
    await expect(taskPanel(page).locator('[data-task-result]')).toHaveAttribute('data-solved', 'true');
    await expect(taskPanel(page).locator('[data-task-outcome]')).toContainText('+60');
    await expect(chip(page)).toHaveAttribute('data-xp', '60');
    await expectNoHorizontalScroll(page);
    await expectNoSeriousAxeViolations(page);
  });
});

test.describe('тренажер «Кумулятивне голосування»', () => {
  test('розрахунок: «1,5» місця — помилка; 600 акцій, 5 місць, 1 кандидат — 101 акція', async ({ page }) => {
    await page.goto('trenazhery/kumuliatyvne-holosuvannia/');
    const form = page.locator('[data-calc-form]');
    await form.getByLabel('N — місць у раді').fill('1,5');
    await form.locator('[data-calc-submit]').click();
    await expect(form.locator('[data-field="seats"] [data-field-error]')).toContainText('має бути цілим числом');

    await form.getByLabel('N — місць у раді').fill('5');
    await form.getByLabel('k — скільки своїх кандидатів провести').fill('1');
    await form.getByLabel('Пакет акціонера, акцій').fill('');
    await form.locator('[data-calc-submit]').click();
    await expect(page.locator('[data-calc-minimum]')).toContainText('101');
    await expect(page.locator('[data-verdict="candidates"]')).toHaveCount(0);
    await expectNoHorizontalScroll(page);
    await expectNoSeriousAxeViolations(page);
  });

  test('задача: хибна і правильна відповіді', async ({ page }) => {
    await page.goto('trenazhery/kumuliatyvne-holosuvannia/');
    await openTaskMode(page);
    const solve = async (correct: boolean) => {
      const input = { votingShares: await taskValue(page, 'votingShares'), seats: await taskValue(page, 'seats'), targetSeats: await taskValue(page, 'targetSeats') };
      const stake = await taskValue(page, 'stake');
      const minimum = minimumStakeForSeats(input);
      const seats = guaranteedSeats({ votingShares: input.votingShares, seats: input.seats, stake });
      if (!minimum.ok || !seats.ok) throw new Error('некоректний варіант');
      await taskPanel(page).getByLabel('Мінімальний пакет, акцій').fill(String(minimum.value.minimumShares + (correct ? 0 : 1)));
      await taskPanel(page).getByRole('radio', { name: seats.value >= input.targetSeats ? 'Так' : 'Ні' }).check();
      await taskPanel(page).locator('[data-task-check]').click();
    };
    await solve(false);
    await expect(taskPanel(page).locator('[data-task-result]')).toHaveAttribute('data-solved', 'false');
    await expect(taskPanel(page).locator('[data-part="minimumShares"]')).toHaveAttribute('data-state', 'err');
    await expect(chip(page)).toHaveAttribute('data-xp', '0');
    await taskPanel(page).locator('[data-task-next]').click();
    await solve(true);
    await expect(taskPanel(page).locator('[data-task-result]')).toHaveAttribute('data-solved', 'true');
    await expect(chip(page)).toHaveAttribute('data-xp', '60');
  });
});

test.describe('тренажер «Дивіденди й чисті активи»', () => {
  test('розрахунок: дивіденд «1,5» грн на привілейовану акцію; правило чистих активів', async ({ page }) => {
    await page.goto('trenazhery/dyvidendy/');
    const form = page.locator('[data-calc-form]');
    await form.getByLabel('Дивіденд на привілейовану акцію').fill('1,5');
    await form.locator('[data-calc-submit]').click();
    await expect(page.locator('[data-figure="preferredDividends"]')).toHaveText(/^30\s000\sгрн$/);
    await expect(page.locator('[data-steps="dividends"]')).toContainText(/1,50\sгрн/);
    await expect(page.locator('[data-verdict="net-assets"]')).toHaveAttribute('data-state', 'ok');

    await form.getByLabel('Власний капітал до виплати').fill('abc');
    await form.locator('[data-calc-submit]').click();
    await expect(form.locator('[data-field="equityBeforeDividends"] [data-field-error]')).toContainText('наприклад 1,5');
    await expectNoHorizontalScroll(page);
    await expectNoSeriousAxeViolations(page);
  });

  test('задача: хибна і правильна відповіді', async ({ page }) => {
    await page.goto('trenazhery/dyvidendy/');
    await openTaskMode(page);
    const solve = async (correct: boolean) => {
      const result = distributeProfit({
        netProfit: await taskValue(page, 'netProfit'),
        reserveRate: await taskValue(page, 'reserveRate'),
        preferredShares: await taskValue(page, 'preferredShares'),
        preferredDividendPerShare: await taskValue(page, 'preferredDividendPerShare'),
        commonShares: await taskValue(page, 'commonShares'),
        commonPayoutRatio: await taskValue(page, 'commonPayoutRatio'),
        netAssets: {
          equityBeforeDividends: await taskValue(page, 'equityBeforeDividends'),
          statutoryCapital: await taskValue(page, 'statutoryCapital'),
          reserveCapitalAfter: await taskValue(page, 'reserveCapitalAfter'),
          preferredLiquidationExcess: await taskValue(page, 'preferredLiquidationExcess'),
        },
      });
      if (!result.ok) throw new Error(result.error.message);
      const value = result.value;
      await taskPanel(page).getByLabel('Дивіденд на просту акцію, грн').fill(uk(Math.round(value.commonPerShare * 100) / 100 + (correct ? 0 : 1)));
      await taskPanel(page).getByLabel('Усього дивідендів, грн').fill(String(value.totalDividends));
      await taskPanel(page).getByLabel('Дивідендний вихід, %').fill(uk(Math.round(value.payoutRatio * 1000) / 10));
      await taskPanel(page).getByRole('radio', { name: value.netAssetsCheck?.compliant ? 'Так' : 'Ні' }).check();
      await taskPanel(page).locator('[data-task-check]').click();
    };
    await solve(false);
    await expect(taskPanel(page).locator('[data-task-result]')).toHaveAttribute('data-solved', 'false');
    await expect(chip(page)).toHaveAttribute('data-xp', '0');
    await taskPanel(page).locator('[data-task-next]').click();
    await solve(true);
    await expect(taskPanel(page).locator('[data-task-result]')).toHaveAttribute('data-solved', 'true');
    await expect(taskPanel(page).locator('[data-task-outcome]')).toContainText('+60');
    await expect(chip(page)).toHaveAttribute('data-xp', '60');
    await expectNoHorizontalScroll(page);
    await expectNoSeriousAxeViolations(page);
  });
});

test.describe('каталоги й інтеграція', () => {
  test('головна: картки тренажерів ведуть на тренажери, «незабаром» немає', async ({ page }) => {
    await page.goto('');
    const cards = page.locator('[data-trainers] [data-trainer]');
    await expect(cards).toHaveCount(3);
    await expect(page.locator('[data-trainers] .soon')).toHaveCount(0);
    await page.locator('[data-trainer="cumulative"]').click();
    await expect(page).toHaveURL(/\/trenazhery\/kumuliatyvne-holosuvannia\/$/);
    await expect(page.locator('h1')).toHaveText('Кумулятивне голосування');
  });

  test('тема 1 посилається на практичну П1; список практичних і тренажерів без горизонтального скролу й serious axe', async ({ page }) => {
    await page.goto('temy/korporatsiia-i-korporatyvne-upravlinnia/');
    await page.locator('[data-topic-practical="p01"]').first().click();
    await expect(page).toHaveURL(/\/praktychni\/p01\/$/);

    await page.goto('praktychni/');
    await expect(page.locator('[data-practical]')).toHaveCount(8);
    await expect(page.locator('[data-practical][data-status="published"]')).toHaveCount(1);
    await expect(page.locator('[data-practical="p03"] [data-trainer-link="quorum"]')).toHaveAttribute('href', /\/trenazhery\/kvorum\/$/);
    await expectNoHorizontalScroll(page);
    await expectNoSeriousAxeViolations(page);

    await page.goto('trenazhery/');
    await expect(page.locator('[data-trainer-card]')).toHaveCount(4);
    await expectNoHorizontalScroll(page);
    await expectNoSeriousAxeViolations(page);
  });
});
