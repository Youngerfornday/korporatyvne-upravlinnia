import AxeBuilder from '@axe-core/playwright';
import { expect, type Page } from '@playwright/test';
import { BASE_PATH } from './playwright.config';

/** Усі внутрішні посилання й ресурси сторінки починаються з base. */
export async function expectAllReferencesBased(page: Page): Promise<void> {
  const references = await page.$$eval('[href], [src]', (elements) =>
    elements.map((el) => el.getAttribute('href') ?? el.getAttribute('src') ?? '').filter((value) => value.startsWith('/')),
  );
  expect(references.length).toBeGreaterThan(0);
  for (const reference of references) expect(reference.startsWith(BASE_PATH), reference).toBe(true);
}

/** Сторінка не прокручується горизонтально (важливо на 390 px). */
export async function expectNoHorizontalScroll(page: Page): Promise<void> {
  const { scrollWidth, clientWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(scrollWidth, 'горизонтальний скрол').toBeLessThanOrEqual(clientWidth);
}

/** axe-core: жодного порушення рівня serious або critical. */
export async function expectNoSeriousAxeViolations(page: Page): Promise<void> {
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze();
  const serious = results.violations.filter((violation) => violation.impact === 'serious' || violation.impact === 'critical');
  const summary = serious.map((v) => `${v.id} (${v.impact}): ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`).join('\n');
  expect(serious, summary).toEqual([]);
}

export async function setTheme(page: Page, theme: 'light' | 'dark'): Promise<void> {
  await page.emulateMedia({ colorScheme: theme });
}
