import { expect, test } from '@playwright/test';

test.describe('перемикач теми', () => {
  test('перемикає data-theme і зберігає вибір у localStorage під ключем ku:v1:theme; без мерехтіння після перезавантаження', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'light' });
    await page.goto('');
    const toggle = page.locator('[data-theme-toggle]').first();
    await expect(toggle).toHaveAttribute('aria-label', 'Увімкнути темну тему');

    await toggle.click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await expect(toggle).toHaveAttribute('aria-label', 'Увімкнути світлу тему');
    expect(await page.evaluate(() => localStorage.getItem('ku:v1:theme'))).toBe('dark');

    await page.reload();
    // Inline-скрипт у <head> ставить атрибут до першого рендеру: тема відома вже на document.readyState=loading
    const early = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
    expect(early).toBe('dark');
    const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    expect(bg).toBe('rgb(11, 20, 36)');

    await toggle.click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  });
});

test.describe('мобільне меню', () => {
  test.skip(({ viewport }) => (viewport?.width ?? 0) > 1280, 'меню є лише на вузьких екранах');

  test('відкривається з клавіатури, тримає фокус, закривається Esc і повертає фокус на кнопку', async ({ page }) => {
    await page.goto('');
    const button = page.locator('[data-menu-open]');
    await expect(button).toBeVisible();
    await expect(button).toHaveAttribute('aria-expanded', 'false');
    await expect(page.locator('.nav')).toBeHidden();

    await button.focus();
    await page.keyboard.press('Enter');
    const dialog = page.locator('#site-menu');
    await expect(dialog).toBeVisible();
    await expect(button).toHaveAttribute('aria-expanded', 'true');
    await expect(dialog.getByRole('link', { name: /^Теми/ })).toBeVisible();

    // Tab кілька разів не виходить за межі меню (модальний dialog робить решту сторінки inert)
    for (let i = 0; i < 12; i += 1) await page.keyboard.press('Tab');
    const focusInside = await page.evaluate(() => document.activeElement?.closest('#site-menu') !== null);
    expect(focusInside).toBe(true);

    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(button).toHaveAttribute('aria-expanded', 'false');
    await expect(button).toBeFocused();
  });

  test('посилання «Теми» з меню веде на сторінку тем', async ({ page }) => {
    await page.goto('');
    await page.locator('[data-menu-open]').click();
    await page.locator('#site-menu').getByRole('link', { name: /^Теми/ }).click();
    await expect(page).toHaveURL(/\/temy\/$/);
  });
});

test.describe('шапка на десктопі', () => {
  test.skip(({ viewport }) => (viewport?.width ?? 0) <= 1280, 'навігація видима лише на широких екранах');

  test('навігація видима, поточний розділ позначено, кнопка меню схована', async ({ page }) => {
    await page.goto('temy/');
    await expect(page.locator('.nav a[aria-current="page"]')).toHaveText('Теми');
    await expect(page.locator('[data-menu-open]')).toBeHidden();
    await expect(page.locator('.nav .nav-soon')).toHaveCount(1);
    await expect(page.locator('.nav a[href$="/trenazhery/"]')).toHaveText('Тренажери');
    await expect(page.locator('.nav a[href$="/testy/"]')).toHaveText('Тести');
  });
});

test('вітрина: підказка терміна відкривається кнопкою і закривається Esc; самоперевірка відкриває розбір', async ({ page }) => {
  await page.goto('rozrobka/komponenty/');
  const term = page.locator('button.term[data-term="corporation"]').first();
  await term.click();
  const pop = page.locator('#pop-corporation');
  await expect(pop).toBeVisible();
  await expect(term).toHaveAttribute('aria-expanded', 'true');
  await page.keyboard.press('Escape');
  await expect(pop).toBeHidden();

  const selfcheck = page.locator('[data-selfcheck]');
  const answered = page.evaluate(() => new Promise<{ correct: boolean }>((resolve) => document.addEventListener('ku:selfcheck', (e) => resolve((e as CustomEvent).detail), { once: true })));
  await selfcheck.locator('.sc-q').first().locator('.opt').nth(1).click();
  expect((await answered).correct).toBe(false);
  await expect(selfcheck.locator('.sc-q').first().locator('.options')).toHaveAttribute('data-answered', '');
  await expect(selfcheck.locator('.sc-q').first().locator('.opt-why').first()).toBeVisible();

  await page.locator('[data-demo-toast]').click();
  await expect(page.locator('#toast')).toHaveAttribute('data-show', '');
});
