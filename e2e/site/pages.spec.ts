import { expect, test } from '@playwright/test';
import { expectAllReferencesBased, expectNoHorizontalScroll, expectNoSeriousAxeViolations } from './helpers';

const PAGES = [
  { name: 'головна', path: '', heading: 'Корпоративне управління' },
  { name: 'модуль', path: 'moduli/m1/', heading: /Основи корпоративного управління/ },
  { name: 'тема опублікована', path: 'temy/korporatsiia-i-korporatyvne-upravlinnia/', heading: /Корпорація і корпоративне управління/ },
  { name: 'тема-заглушка', path: 'temy/modeli-ku-ta-mizhnarodni-standarty/', heading: /Моделі корпоративного управління/ },
  { name: 'усі теми', path: 'temy/', heading: 'Теми курсу' },
  { name: 'вітрина компонентів', path: 'rozrobka/komponenty/', heading: 'Вітрина компонентів' },
  { name: 'список тестів', path: 'testy/', heading: 'Тренувальні тести' },
  { name: 'тест теми 1 (фікстурний банк)', path: 'testy/korporatsiia-i-korporatyvne-upravlinnia/', heading: /Тренувальний тест · Тема 1/ },
  { name: 'тест-заглушка', path: 'testy/aktsionery-ta-zahalni-zbory/', heading: /Тренувальний тест · Тема 4/ },
  { name: 'профіль', path: 'profil/', heading: 'Акціонер' },
] as const;

for (const item of PAGES) {
  test(`${item.name}: відкривається, українська, посилання з base, без горизонтального скролу, axe без serious`, async ({ page }) => {
    const response = await page.goto(item.path);
    expect(response?.status()).toBe(200);
    await expect(page.locator('html')).toHaveAttribute('lang', 'uk');
    await expect(page.getByRole('heading', { level: 1, name: item.heading })).toBeVisible();
    await expectAllReferencesBased(page);
    await expectNoHorizontalScroll(page);
    await expectNoSeriousAxeViolations(page);
  });
}

test('головна: лічильники з реєстру, порядок денний з 4 модулів і 12 тем, кворум 0 із 12', async ({ page }) => {
  await page.goto('');
  const facts = page.locator('dl[aria-label="Обсяг курсу"] dd');
  await expect(facts).toHaveText(['4', '12', '8', '120']);
  await expect(page.locator('[data-agenda] [data-module]')).toHaveCount(4);
  await expect(page.locator('[data-agenda] a.topic')).toHaveCount(12);
  await expect(page.locator('[data-quorum-label]')).toHaveText('0 із 12 тем');
  await expect(page.locator('[data-quorum-cells] i')).toHaveCount(12);
  await expect(page.locator('[data-continue-label]')).toHaveText('Почати: Тема 1');
  await expect(page.locator('[data-player-chip]')).toHaveAttribute('data-xp', '0');
});

test('модуль: три теми з номерами й посиланнями на сторінки тем', async ({ page }) => {
  await page.goto('moduli/m2/');
  const topics = page.locator('a.topic[data-topic]');
  await expect(topics).toHaveCount(3);
  await expect(topics.first()).toContainText('4.');
  await topics.first().click();
  await expect(page).toHaveURL(/temy\/aktsionery-ta-zahalni-zbory\/$/);
});

test('тема 1 опублікована: лекція зі змістом, чотирма схемами, самоперевіркою і кнопкою тренувального тесту', async ({ page }) => {
  await page.goto('temy/korporatsiia-i-korporatyvne-upravlinnia/');
  await expect(page.locator('[data-topic-pending]')).toHaveCount(0);
  await expect(page.locator('[data-topic-article]')).toBeVisible();
  expect(await page.locator('[data-topic-article] h2[id]').count()).toBeGreaterThanOrEqual(3);
  await expect(page.locator('[data-topic-article] .figure svg')).toHaveCount(4);
  await expect(page.locator('[data-selfcheck][data-topic="t01"]')).toBeVisible();
  const cta = page.locator('[data-topic-quiz-cta] a');
  await expect(cta).toHaveText(/Пройти тренувальний тест/);
  await cta.click();
  await expect(page).toHaveURL(/testy\/korporatsiia-i-korporatyvne-upravlinnia\/$/);
});

test('тема без лекції: сторінка «Тема готується» з анотацією, а не 404', async ({ page }) => {
  const response = await page.goto('temy/aktsionery-ta-zahalni-zbory/');
  expect(response?.status()).toBe(200);
  await expect(page.getByText('Тема готується')).toBeVisible();
  await expect(page.locator('[data-topic-pending]')).toContainText('кворум');
  await expect(page.getByRole('navigation', { name: 'Сусідні теми' }).getByRole('link')).toHaveCount(2);
});

test('SEO: canonical, OG-теги й зображення курсу', async ({ page, request }) => {
  await page.goto('');
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', 'https://youngerfornday.github.io/korporatyvne-upravlinnia/');
  await expect(page.locator('meta[property="og:image"]')).toHaveAttribute('content', /\/korporatyvne-upravlinnia\/brand\/og-course\.png$/);
  await expect(page.locator('meta[property="og:locale"]')).toHaveAttribute('content', 'uk_UA');
  const og = await request.get('brand/og-course.png');
  expect(og.status()).toBe(200);
  expect(Number(og.headers()['content-length'] ?? 0)).toBeGreaterThan(10_000);
});

test('вітрина: службова сторінка noindex і не лінкується з навігації', async ({ page }) => {
  await page.goto('');
  await expect(page.locator('a[href*="rozrobka"]')).toHaveCount(0);
  await page.goto('rozrobka/komponenty/');
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex');
});

test('404: невідома адреса показує сторінку курсу з посиланням на головну', async ({ page }) => {
  const response = await page.goto('tsiiei-storinky-nemaie/');
  expect(response?.status()).toBe(404);
  await expect(page.getByRole('heading', { level: 1, name: 'Сторінку не знайдено' })).toBeVisible();
  await expectAllReferencesBased(page);
  await page.getByRole('link', { name: 'Перейти на головну сторінку курсу' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Корпоративне управління' })).toBeVisible();
});
