import { expect, test, type Page } from '@playwright/test';
import { LIVE_URL } from '../../playwright.live.config';

/**
 * Приймання живого сайту на GitHub Pages: сторінки курсу, острови, матеріали для вивантаження й резервна копія.
 * Запуск: npm run test:live (адресу можна змінити через LIVE_URL).
 */

const BASE_PATH = new URL(LIVE_URL).pathname;
const TOPIC_1 = 'temy/korporatsiia-i-korporatyvne-upravlinnia/';
const QUIZ_1 = 'testy/korporatsiia-i-korporatyvne-upravlinnia/';
const SLIDES_1 = `${TOPIC_1}prezentatsiia/`;

const live = (path: string): string => new URL(path, LIVE_URL).href;

async function sameOriginReferences(page: Page): Promise<string[]> {
  return page.$$eval('[href], [src]', (elements) =>
    elements
      .map((element) => element.getAttribute('href') ?? element.getAttribute('src') ?? '')
      .filter((value) => value.startsWith('/')),
  );
}

async function expectNoHorizontalScroll(page: Page): Promise<void> {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
}

test('головна: українською, назва курсу, 12 тем порядку денного і тренажери ведуть на сторінки', async ({ page }) => {
  const response = await page.goto(LIVE_URL);

  expect(response?.status()).toBe(200);
  await expect(page.locator('html')).toHaveAttribute('lang', 'uk');
  await expect(page.getByRole('heading', { level: 1, name: 'Корпоративне управління' })).toBeVisible();
  await expect(page.locator('#agenda a.topic')).toHaveCount(12);
  await expect(page.locator('[data-trainers] a[href]')).not.toHaveCount(0);
  await expectNoHorizontalScroll(page);
});

test('усі посилання від кореня містять base, а ассети завантажуються', async ({ page, request }) => {
  await page.goto(LIVE_URL);
  const references = await sameOriginReferences(page);

  expect(references.length).toBeGreaterThan(0);
  for (const reference of references) expect(reference.startsWith(BASE_PATH), reference).toBe(true);

  const assets = await page.$$eval('link[href]:not([rel="canonical"]), script[src], img[src]', (elements) =>
    elements.map((element) => element.getAttribute('href') ?? element.getAttribute('src') ?? ''),
  );
  for (const asset of assets) {
    const response = await request.get(new URL(asset, LIVE_URL).href);
    expect(response.status(), asset).toBe(200);
  }
});

test('тема 1: лонгрід зі схемами, самоперевіркою і переходами на тест, презентацію й практичне', async ({ page }) => {
  expect((await page.goto(live(TOPIC_1)))?.status()).toBe(200);

  await expect(page.locator('[data-topic-pending]')).toHaveCount(0);
  await expect(page.locator('article svg[role="img"]')).toHaveCount(4);
  await expect(page.locator('[data-selfcheck][data-topic="t01"]')).toBeVisible();
  await expect(page.locator(`a[href$="${QUIZ_1}"]`).first()).toBeVisible();
  await expect(page.locator('[data-topic-slides-link]')).toBeVisible();
  await expectNoHorizontalScroll(page);
});

test('тренувальний тест теми 1: острів завантажується і показує питання', async ({ page }) => {
  expect((await page.goto(live(QUIZ_1)))?.status()).toBe(200);

  await expect(page.locator('[data-quiz]')).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('[data-quiz] h2').first()).toBeVisible();
});

test('презентація теми 1: усі слайди на місці', async ({ page }) => {
  expect((await page.goto(live(SLIDES_1)))?.status()).toBe(200);

  const deck = page.locator('[data-deck]');
  await expect(deck).toBeVisible();
  const count = Number(await deck.getAttribute('data-count'));
  expect(count).toBeGreaterThanOrEqual(20);
  await expect(page.locator('[data-slide]')).toHaveCount(count);
});

test('кабінет викладача, практичні й тренажери відкриваються', async ({ page }) => {
  expect((await page.goto(live('kabinet/')))?.status()).toBe(200);
  await expect(page.locator('[data-cabinet]')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole('tablist', { name: 'Представлення' })).toBeVisible();

  for (const path of ['moodle/', 'praktychni/', 'praktychni/p01/', 'trenazhery/', 'trenazhery/kvorum/', 'profil/']) {
    const response = await page.goto(live(path));
    expect(response?.status(), path).toBe(200);
    await expect(page.getByRole('heading', { level: 1 }), path).toBeVisible();
  }
});

test('кожен файл із маніфесту матеріалів завантажується й не порожній', async ({ request }) => {
  const manifestResponse = await request.get(live('downloads/manifest.json'));
  expect(manifestResponse.status()).toBe(200);

  const manifest = (await manifestResponse.json()) as { items: Array<{ id: string; path?: string; url?: string; bytes: number }> };
  expect(manifest.items.length).toBeGreaterThan(0);

  for (const item of manifest.items) {
    const target = item.path ? live(item.path) : item.url;
    expect(target, item.id).toBeTruthy();
    const response = await request.get(target as string, { maxRedirects: 5 });
    expect(response.status(), item.id).toBe(200);
    const body = await response.body();
    expect(body.length, item.id).toBeGreaterThan(0);
    if (item.path) expect(body.length, item.id).toBe(item.bytes);
  }
});

test('неіснуюча адреса віддає нашу сторінку 404', async ({ page }) => {
  const response = await page.goto(live('tsiiei-storinky-nemaie/'));

  expect(response?.status()).toBe(404);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
});
