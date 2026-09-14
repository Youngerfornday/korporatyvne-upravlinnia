import { expect, test, type Page } from '@playwright/test';
import { LIVE_URL } from '../../playwright.live.config';

const BASE_PATH = new URL(LIVE_URL).pathname;

async function sameOriginReferences(page: Page): Promise<string[]> {
  return page.$$eval('[href], [src]', (elements) =>
    elements
      .map((element) => element.getAttribute('href') ?? element.getAttribute('src') ?? '')
      .filter((value) => value.startsWith('/')),
  );
}

test('home page answers 200 in Ukrainian with the course title and module links', async ({ page }) => {
  const response = await page.goto(LIVE_URL);

  expect(response?.status()).toBe(200);
  await expect(page.locator('html')).toHaveAttribute('lang', 'uk');
  await expect(page.getByRole('heading', { level: 1, name: 'Корпоративне управління' })).toBeVisible();
  await expect(page.getByText('НУ «Чернігівська політехніка»')).toBeVisible();
  await expect(page.getByText('Курс у розробці.')).toBeVisible();
  await expect(page.getByRole('link', { name: /^Модуль \d\./ })).toHaveCount(4);
});

test('every root-relative link and asset carries the base and assets load', async ({ page, request }) => {
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

test('the address without a trailing slash reaches the home page', async ({ page }) => {
  const response = await page.goto(LIVE_URL.replace(/\/$/, ''));

  expect(response?.status()).toBe(200);
  expect(new URL(page.url()).pathname).toBe(BASE_PATH);
});

test('an unknown address shows the course 404 page with a working link home', async ({ page }) => {
  const response = await page.goto(new URL('tsiiei-storinky-nemaie/', LIVE_URL).href);

  expect(response?.status()).toBe(404);
  await expect(page.getByRole('heading', { level: 1, name: 'Сторінку не знайдено' })).toBeVisible();
  for (const reference of await sameOriginReferences(page)) expect(reference.startsWith(BASE_PATH), reference).toBe(true);

  await page.getByRole('link', { name: 'Перейти на головну сторінку курсу' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Корпоративне управління' })).toBeVisible();
});
