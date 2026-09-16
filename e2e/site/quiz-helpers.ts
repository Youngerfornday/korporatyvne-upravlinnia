import { expect, type Locator, type Page } from '@playwright/test';

/**
 * Правильні відповіді на фікстурний банк теми 1 (src/components/quiz/__fixtures__/e2e-bank.ts).
 * Порядок питань і варіантів у спробі випадковий, тому питання впізнається за стовбуром.
 */
export const QUIZ_PATH = 'testy/korporatsiia-i-korporatyvne-upravlinnia/';
export const QUIZ_QUESTIONS = 8;

export function quiz(page: Page): Locator {
  return page.locator('[data-quiz]');
}

export function card(page: Page): Locator {
  return page.locator('.qcard');
}

function parseUkNumber(text: string): number {
  return Number(text.replace(/[\s  ]/g, '').replace(',', '.'));
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Клік по варіанту з точним текстом (hasText — підрядок, тому «Правда» збіглася б і з «Неправда»). */
async function answerChoice(page: Page, texts: readonly string[]): Promise<void> {
  for (const text of texts) {
    await page.locator('label.opt', { has: page.locator('.opt-text', { hasText: new RegExp(`^${escapeRegExp(text)}$`) }) }).click();
  }
}

/** Відповідає на поточне питання правильно; повертає, якого типу було питання. */
export async function answerCurrentCorrectly(page: Page): Promise<string> {
  const current = card(page);
  const title = (await current.locator('.q-title').innerText()).replace(/\s+/g, ' ');
  const stem = (await current.locator('.q-stem').first().innerText()).replace(/\s+/g, ' ');

  if (title.includes('одиночний вибір')) {
    await answerChoice(page, ['Власники передають управління найманим менеджерам']);
    return 'multichoice';
  }
  if (title.includes('множинний вибір')) {
    await answerChoice(page, ['Незалежні директори в раді', 'Винагорода, прив’язана до результату']);
    return 'multichoice-multi';
  }
  if (title.includes('правда чи неправда')) {
    await answerChoice(page, ['Правда']);
    return 'truefalse';
  }
  if (title.includes('відповідність')) {
    await current.locator('.match-row', { hasText: 'Акціонер' }).locator('select').selectOption({ label: 'Принципал' });
    await current.locator('.match-row', { hasText: 'Менеджер' }).locator('select').selectOption({ label: 'Агент' });
    return 'matching';
  }
  if (title.includes('числова відповідь')) {
    await current.getByLabel('Відповідь').fill('15');
    return 'numerical';
  }
  if (title.includes('розрахунок')) {
    const match = /Усього акцій ([\d\s  ,]+), у менеджменту ([\d\s  ,]+)\./.exec(stem);
    if (!match) throw new Error(`Не розібрано стовбур calculated: ${stem}`);
    const n = parseUkNumber(match[1] ?? '0');
    const m = parseUkNumber(match[2] ?? '0');
    await current.getByLabel('Відповідь').fill(((m / n) * 100).toFixed(4).replace('.', ','));
    return 'calculated';
  }
  if (title.includes('заповнення пропусків')) {
    await current.getByLabel('Пропуск 1').selectOption({ label: 'принципал' });
    await current.getByLabel('Пропуск 2').selectOption({ label: 'агент' });
    return 'ddwtos';
  }
  if (title.includes('кейс із пропусками')) {
    await current.getByLabel('Частина 1').selectOption({ label: 'агентським конфліктом другого типу' });
    await current.getByLabel('Частина 2').fill('60');
    return 'multianswer';
  }
  throw new Error(`Невідомий тип питання: ${title}`);
}

export async function submitAndExpectRight(page: Page): Promise<void> {
  await page.locator('[data-quiz-submit]').click();
  await expect(card(page).locator('.verdict')).toContainText('Правильно');
}

/** Проходить усю спробу правильно і завершує її; повертає набір типів, які трапилися. */
export async function passWholeQuiz(page: Page): Promise<Set<string>> {
  const seen = new Set<string>();
  for (let index = 0; index < QUIZ_QUESTIONS; index += 1) {
    await expect(card(page).locator('.q-title')).toContainText(`Питання ${index + 1} із ${QUIZ_QUESTIONS}`);
    seen.add(await answerCurrentCorrectly(page));
    await submitAndExpectRight(page);
    if (index < QUIZ_QUESTIONS - 1) await page.locator('[data-quiz-next]').click();
    else await page.locator('[data-quiz-finish]').first().click();
  }
  await expect(page.locator('[data-quiz-summary]')).toBeVisible();
  return seen;
}
