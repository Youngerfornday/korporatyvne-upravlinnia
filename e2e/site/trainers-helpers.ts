import { expect, type Locator, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';
import { normalizeTypography } from '../../src/lib/typography/normalize';

/**
 * Помічники E2E тренажерів. Правильні відповіді матриці П1 беруться з content/practicals/p01.yaml
 * (та сама типографіка, що на сторінці), тож тест не залежить від порядку перемішування.
 */
export const P01_PATH = 'praktychni/p01/';
export const MODELS_PER_FEATURE = 4;

interface Cell {
  readonly model: string;
  readonly statement: string;
}

interface PracticalYaml {
  readonly trainer: {
    readonly models: readonly { readonly id: string; readonly title: string }[];
    readonly features: readonly { readonly id: string; readonly cells: readonly Cell[] }[];
  };
}

const flat = (text: string) => text.replace(/\s+/g, ' ').trim();

function loadP01(): PracticalYaml {
  const file = fileURLToPath(new URL('../../content/practicals/p01.yaml', import.meta.url));
  return parse(readFileSync(file, 'utf8')) as PracticalYaml;
}

/** Формулювання (як на сторінці) → назва правильної моделі; і список усіх назв моделей. */
export function matrixAnswers(): { readonly answers: ReadonlyMap<string, string>; readonly models: readonly string[] } {
  const { trainer } = loadP01();
  const titles = new Map(trainer.models.map((model) => [model.id, flat(normalizeTypography(model.title))]));
  const answers = new Map(
    trainer.features.flatMap((feature) => feature.cells.map((cell) => [flat(normalizeTypography(cell.statement)), titles.get(cell.model) ?? ''] as const)),
  );
  return { answers, models: [...titles.values()] };
}

/** Кількість ознак і формулювань матриці П1 — з даних, бо контент матриці ще може зростати. */
export function matrixTotals(): { readonly features: number; readonly items: number } {
  const { trainer } = loadP01();
  return { features: trainer.features.length, items: trainer.features.reduce((sum, feature) => sum + feature.cells.length, 0) };
}

export function matrix(page: Page): Locator {
  return page.locator('[data-matrix]');
}

/** Зіставляє всі 4 формулювання поточної ознаки: правильно, крім `wrongCount` перших карток. */
export async function answerCurrentFeature(page: Page, wrongCount = 0): Promise<void> {
  const { answers, models } = matrixAnswers();
  const cards = matrix(page).locator('[data-matrix-card]');
  await expect(cards).toHaveCount(4);
  for (let index = 0; index < 4; index += 1) {
    const card = cards.nth(index);
    const text = flat((await card.locator('.mcard-text').textContent()) ?? '');
    const right = answers.get(text);
    expect(right, `немає відповіді для «${text}»`).toBeTruthy();
    const choice = index < wrongCount ? (models.find((title) => title !== right) ?? '') : (right ?? '');
    await card.locator('select').selectOption({ label: choice });
  }
}

export function chip(page: Page): Locator {
  return page.locator('[data-player-chip]');
}

/** Значення з фабули задачі: data-raw на [data-task-value]. */
export async function taskValue(page: Page, name: string): Promise<number> {
  const locator = page.locator(`[role="tabpanel"]:not([hidden]) [data-task-value="${name}"]`);
  if ((await locator.count()) === 0) return 0;
  return Number(await locator.first().getAttribute('data-raw'));
}

export function taskPanel(page: Page): Locator {
  return page.locator('[role="tabpanel"]:not([hidden]) [data-task]');
}

export async function openTaskMode(page: Page): Promise<void> {
  await page.getByRole('tab', { name: 'Задача' }).click();
  await expect(taskPanel(page)).toBeVisible();
}

/** Число у форматі поля: кома як десятковий знак. */
export function uk(value: number): string {
  return String(value).replace('.', ',');
}

/** Ряд ЄДРПОУ практичної 2: числа для перевірки відповідей задачі на динаміку. */
interface LegalFormYaml {
  readonly trainer: {
    readonly criteria: readonly { readonly id: string }[];
    readonly forms: readonly { readonly id: string; readonly short: string }[];
    readonly statistics: { readonly points: readonly { readonly date: string; readonly generation: string; readonly values: Readonly<Record<string, number>> }[] };
  };
}

export const P02_PATH = 'praktychni/p02/';

export function loadP02(): LegalFormYaml['trainer'] {
  const file = fileURLToPath(new URL('../../content/practicals/p02.yaml', import.meta.url));
  return (parse(readFileSync(file, 'utf8')) as LegalFormYaml).trainer;
}

/** Покоління таблиці ЄДРПОУ за датою: поділ ПАТ/ПрАТ порівнюють лише в межах одного покоління. */
export function registryGeneration(date: string): string {
  return loadP02().statistics.points.find((point) => point.date === date)?.generation ?? '';
}

export function registryValue(date: string, formKey: string): number {
  return loadP02().statistics.points.find((point) => point.date === date)?.values[formKey] ?? 0;
}
