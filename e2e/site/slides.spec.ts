import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';
import { expectAllReferencesBased, expectNoHorizontalScroll, expectNoSeriousAxeViolations } from './helpers';

/** Веб-режим презентації теми 1: усі слайди, навігація, нотатки доповідача, кнопка на сторінці теми, друк. */

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const DECK = parse(readFileSync(`${ROOT}content/modules/m1/t01/slides.yaml`, 'utf8')) as { slides: Array<{ id: string; type: string }> };
const COUNT = DECK.slides.length;
const TOPIC = 'temy/korporatsiia-i-korporatyvne-upravlinnia/';
const SLIDES = `${TOPIC}prezentatsiia/`;
/** Номер першого слайда кожного з перевірюваних типів (1-based). */
const numberOf = (type: string) => DECK.slides.findIndex((slide) => slide.type === type) + 1;

const counter = (page: Page) => page.locator('[data-deck-count]');
const active = (page: Page) => page.locator('[data-slide][data-active]');

async function openDeck(page: Page, hash = ''): Promise<void> {
  const response = await page.goto(`${SLIDES}${hash}`);
  expect(response?.status()).toBe(200);
  await expect(page.locator('[data-deck][data-deck-ready]')).toBeAttached();
}

test('рендерить усі слайди теми 1, показує один, посилання з base, без горизонтального скролу, axe без serious', async ({ page }) => {
  await openDeck(page);
  await expect(page.locator('html')).toHaveAttribute('lang', 'uk');
  await expect(page.getByRole('heading', { level: 1, name: /Корпорація і корпоративне управління/ })).toBeVisible();
  await expect(page.locator('[data-slide]')).toHaveCount(COUNT);
  expect(COUNT).toBeGreaterThanOrEqual(22);
  expect(COUNT).toBeLessThanOrEqual(28);
  await expect(active(page)).toHaveCount(1);
  await expect(active(page)).toHaveAttribute('data-slide-type', 'title');
  await expect(page.locator('[data-slide]:visible')).toHaveCount(1);
  await expect(counter(page)).toHaveText(`1 / ${COUNT}`);
  await expect(page.locator('[data-deck-prev]')).toHaveAttribute('aria-disabled', 'true');
  await expectAllReferencesBased(page);
  await expectNoHorizontalScroll(page);
  await expectNoSeriousAxeViolations(page);
});

for (const type of ['figure', 'norm', 'formula', 'two-columns', 'case', 'question', 'summary']) {
  test(`слайд «${type}» з нотатками: доступна назва, без горизонтального скролу, axe без serious`, async ({ page }) => {
    const number = numberOf(type);
    await openDeck(page, `#slide-${number}`);
    await page.locator('[data-deck-notes]').click();
    const slide = active(page);
    await expect(slide).toHaveAttribute('data-slide-type', type);
    await expect(slide.locator('.slide-box')).toHaveAttribute('aria-roledescription', 'слайд');
    await expect(slide.locator('.slide-box')).toHaveAttribute('aria-label', new RegExp(`^Слайд ${number} з ${COUNT}: `));
    await expect(slide.locator('[data-slide-notes]')).toBeVisible();
    await expectNoHorizontalScroll(page);
    await expectNoSeriousAxeViolations(page);
  });
}

test('усі чотири схеми лонгріда — SVG з title і desc', async ({ page }) => {
  await openDeck(page);
  const figures = page.locator('[data-slide-type="figure"] svg[role="img"]');
  await expect(figures).toHaveCount(4);
  for (const svg of await figures.all()) {
    const [titleId, descId] = ((await svg.getAttribute('aria-labelledby')) ?? '').split(' ');
    await expect(svg.locator(`title#${titleId}`)).toHaveCount(1);
    await expect(svg.locator(`desc#${descId}`)).toHaveCount(1);
  }
});

test('клавіатура: стрілки, пробіл, Home/End гортають, номер оголошується й пишеться в адресу', async ({ page }) => {
  await openDeck(page);
  const live = page.locator('[data-deck-live]');

  await page.keyboard.press('ArrowRight');
  await expect(counter(page)).toHaveText(`2 / ${COUNT}`);
  await expect(live).toHaveText(/^Слайд 2 з \d+: /);
  await expect(page).toHaveURL(/#slide-2$/);

  await page.keyboard.press('Space');
  await expect(counter(page)).toHaveText(`3 / ${COUNT}`);
  await page.keyboard.press('ArrowLeft');
  await expect(counter(page)).toHaveText(`2 / ${COUNT}`);

  await page.keyboard.press('End');
  await expect(counter(page)).toHaveText(`${COUNT} / ${COUNT}`);
  await expect(page.locator('[data-deck-next]')).toHaveAttribute('aria-disabled', 'true');
  await expect(active(page)).toHaveAttribute('data-slide-type', 'summary');
  await page.keyboard.press('ArrowRight');
  await expect(counter(page)).toHaveText(`${COUNT} / ${COUNT}`);

  await page.keyboard.press('Home');
  await expect(counter(page)).toHaveText(`1 / ${COUNT}`);
  await expect(page.locator('[data-slide]:visible')).toHaveCount(1);

  // Кнопки панелі працюють і з клавіатури; пробіл на кнопці натискає її, а не гортає вдруге.
  await page.locator('[data-deck-next]').focus();
  await page.keyboard.press('Space');
  await expect(counter(page)).toHaveText(`2 / ${COUNT}`);
  await page.keyboard.press('Enter');
  await expect(counter(page)).toHaveText(`3 / ${COUNT}`);
});

test('посилання на слайд відкриває його, не прокручуючи сторінку повз панель', async ({ page }) => {
  await openDeck(page, '#slide-7');
  await expect(counter(page)).toHaveText(`7 / ${COUNT}`);
  await expect(page.locator('[data-deck-bar]')).toBeInViewport();
});

test('свайп гортає слайди на сенсорному екрані', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'свайп — сценарій сенсорного екрана');
  await openDeck(page);
  const stage = page.locator('[data-deck-stage]');
  const swipe = async (fromX: number, toX: number) => {
    await stage.dispatchEvent('pointerdown', { pointerType: 'touch', clientX: fromX, clientY: 300, isPrimary: true });
    await stage.dispatchEvent('pointerup', { pointerType: 'touch', clientX: toX, clientY: 310, isPrimary: true });
  };
  await swipe(300, 120);
  await expect(counter(page)).toHaveText(`2 / ${COUNT}`);
  await swipe(100, 320);
  await expect(counter(page)).toHaveText(`1 / ${COUNT}`);
});

test('перемикач нотаток доповідача: кнопкою й клавішею N, стан у aria-pressed', async ({ page }) => {
  await openDeck(page);
  const toggle = page.locator('[data-deck-notes]');
  const notes = active(page).locator('[data-slide-notes]');
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');
  await expect(notes).toBeHidden();

  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  await expect(notes).toBeVisible();
  await expect(notes).toContainText('Нотатки доповідача');

  await page.keyboard.press('ArrowRight');
  await expect(active(page).locator('[data-slide-notes]')).toBeVisible();

  // Клавіша N працює й тоді, коли фокус на кнопці панелі.
  await page.keyboard.press('n');
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');
  await expect(active(page).locator('[data-slide-notes]')).toBeHidden();
});

test('кнопка «Презентація» на сторінці теми веде до веб-режиму і назад до лонгріда', async ({ page }) => {
  await page.goto(TOPIC);
  const link = page.locator('[data-topic-slides-link]');
  await expect(link).toHaveText(/Презентація/);
  await link.click();
  await expect(page).toHaveURL(/temy\/korporatsiia-i-korporatyvne-upravlinnia\/prezentatsiia\/$/);
  await page.locator('[data-slides-back]').click();
  await expect(page).toHaveURL(/temy\/korporatsiia-i-korporatyvne-upravlinnia\/$/);
});

test('тема без slides.yaml: ні кнопки, ні сторінки презентації', async ({ page }) => {
  await page.goto('temy/aktsionery-ta-zahalni-zbory/');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expect(page.locator('[data-topic-slides-link]')).toHaveCount(0);
  const response = await page.goto('temy/aktsionery-ta-zahalni-zbory/prezentatsiia/');
  expect(response?.status()).toBe(404);
});

test('на десктопі кожен слайд уміщається в 16:9', async ({ page, isMobile }) => {
  test.skip(isMobile, 'на телефоні слайд навмисно росте у висоту');
  await openDeck(page);
  for (let number = 1; number <= COUNT; number += 1) {
    await page.evaluate((hash) => { location.hash = hash; }, `#slide-${number}`);
    await expect(counter(page)).toHaveText(`${number} / ${COUNT}`);
    const box = await active(page).locator('.slide-box').boundingBox();
    expect(box, `слайд ${number}`).not.toBeNull();
    expect(Math.round(box?.height ?? 0), `слайд ${number} вищий за 16:9`).toBeLessThanOrEqual(Math.round(((box?.width ?? 0) * 9) / 16) + 1);
  }
});

test('друк: усі слайди по одному на сторінку, без панелі й нотаток', async ({ page }) => {
  await openDeck(page);
  await page.locator('[data-deck-notes]').click();
  await page.emulateMedia({ media: 'print' });
  await expect(page.locator('[data-slide]:visible')).toHaveCount(COUNT);
  await expect(page.locator('[data-deck-bar]')).toBeHidden();
  await expect(page.locator('[data-slide-notes]:visible')).toHaveCount(0);
  const pageSize = await page.evaluate(() => getComputedStyle(document.querySelector('[data-slide]') as Element).getPropertyValue('page'));
  expect(pageSize.trim()).toBe('slide');
});
