import { expect, test, type Page, type Route } from '@playwright/test';
import { strFromU8, unzipSync } from 'fflate';
import { readFile } from 'node:fs/promises';
import { E2E_BACKUP_URL } from '../../src/components/cabinet/__fixtures__/manifest';
import { expectNoHorizontalScroll, expectNoSeriousAxeViolations } from './helpers';
import { BASE_PATH } from './playwright.config';

/**
 * Кабінет викладача на фікстурному маніфесті (KU_E2E_DOWNLOADS=1, src/components/cabinet/__fixtures__/manifest.ts).
 * Самі файли матеріалів віддає page.route: так ZIP збирається з реально завантажених байтів, а помилку мережі
 * можна відтворити для одного файлу.
 */

const LECTURE_TITLE = 'Лекція 1. Корпорація і корпоративне управління';

function fixtureBody(path: string): string {
  return `Фікстурний файл кабінету: ${path}\n`.repeat(40);
}

async function serveDownloads(page: Page, failing: readonly string[] = []): Promise<void> {
  await page.route('**/downloads/**', async (route: Route) => {
    const path = new URL(route.request().url()).pathname;
    if (failing.some((suffix) => path.endsWith(suffix))) {
      await route.fulfill({ status: 404, body: 'Not found' });
      return;
    }
    await route.fulfill({ status: 200, contentType: 'application/octet-stream', body: fixtureBody(path) });
  });
}

async function openCabinet(page: Page, query = ''): Promise<void> {
  await page.goto(`kabinet/${query}`);
  await expect(page.locator('[data-cabinet]')).toHaveAttribute('data-hydrated', 'true');
}

const row = (page: Page, id: string) => page.locator(`[data-materials-table] tr[data-material="${id}"]`);
const tab = (page: Page, name: string) => page.getByRole('tab', { name });

test.describe('кабінет викладача', () => {
  test('вид викладача за замовчуванням; «Студент» ховає ключі й пакети і запам’ятовується', async ({ page }) => {
    await openCabinet(page);
    await expect(page.locator('.topbar-actions .seg a[aria-current="true"]')).toHaveText('Викладач');
    await expect(page.locator('[data-audience-option="teacher"]')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('[data-moodle-memo]')).toBeVisible();
    await expect(row(page, 'bank-t01').getByRole('link', { name: /Питання й відповіді/ })).toBeVisible();
    await expect(page.locator('[data-package]')).toHaveCount(2);

    await page.locator('[data-audience-option="student"]').click();
    await expect(page.locator('[data-cabinet]')).toHaveAttribute('data-audience', 'student');
    await expect(page.locator('[data-moodle-memo]')).toHaveCount(0);
    await expect(row(page, 'bank-t01').getByRole('link', { name: /Питання й відповіді/ })).toHaveCount(0);
    await expect(page.locator('[data-package]')).toHaveCount(0);
    await expect(page.locator('[data-ready-packages]')).toContainText('призначені викладачам');
    expect(await page.evaluate(() => localStorage.getItem('ku:v1:view'))).toBe('student');

    await page.reload();
    await expect(page.locator('[data-cabinet]')).toHaveAttribute('data-hydrated', 'true');
    await expect(page.locator('[data-audience-option="student"]')).toHaveAttribute('aria-pressed', 'true');
  });

  test('представлення перемикаються стрілками, Home/End; стан у ?vid= переживає перезавантаження', async ({ page }) => {
    await openCabinet(page);
    await expect(tab(page, 'Таблиця')).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('[data-materials-table]')).toBeVisible();

    await tab(page, 'Таблиця').focus();
    await page.keyboard.press('ArrowRight');
    await expect(tab(page, 'Матриця ПРН')).toBeFocused();
    await expect(tab(page, 'Матриця ПРН')).toHaveAttribute('aria-selected', 'true');
    await expect(page).toHaveURL(/[?&]vid=matrytsia/);
    await expect(page.locator('[data-matrix]')).toBeVisible();

    await page.keyboard.press('Home');
    await expect(tab(page, 'Картки')).toBeFocused();
    await expect(page).toHaveURL(/[?&]vid=kartky/);
    await expect(page.locator('[data-materials-cards]')).toBeVisible();
    await page.keyboard.press('ArrowLeft');
    await expect(tab(page, 'Матриця ПРН')).toHaveAttribute('aria-selected', 'true');
    await page.keyboard.press('End');
    await expect(tab(page, 'Матриця ПРН')).toBeFocused();

    await page.reload();
    await expect(page.locator('[data-cabinet]')).toHaveAttribute('data-hydrated', 'true');
    await expect(page.locator('[data-matrix]')).toBeVisible();
    await tab(page, 'Таблиця').click();
    await expect(page).not.toHaveURL(/vid=/);
  });

  test('матриця ПРН × теми: позначки з підписами, фільтр модуля й пошук ПРН', async ({ page }) => {
    await openCabinet(page, '?vid=matrytsia');
    const prn3 = page.locator('[data-outcome="prn03"]');
    await expect(prn3.locator('[data-coverage]').first()).toHaveAttribute('aria-label', 'лекція і практична');
    await expect(page.locator('[data-matrix] thead th[data-published]')).toHaveCount(12);
    const allRows = await page.locator('[data-matrix] tbody tr').count();
    expect(allRows).toBeGreaterThan(0);

    await page.getByLabel('Модуль').selectOption('m1');
    await expect(page.locator('[data-matrix] thead th[data-published]')).toHaveCount(3);
    await expect(page.locator('[data-matrix-count]')).toContainText('фільтр за модулем');

    await page.getByLabel('Пошук ПРН').fill('прн 15');
    await expect(page.locator('[data-matrix] tbody tr')).toHaveCount(1);
    await expect(page.locator('[data-outcome="prn15"]')).toBeVisible();
  });

  test('фільтри за модулем, типом і Блумом, пошук за терміном, лічильники й скидання', async ({ page }) => {
    await openCabinet(page);
    const count = page.locator('[data-results-count]');
    const total = Number(await count.getAttribute('data-results-count'));
    expect(total).toBeGreaterThan(20);

    await page.locator('[data-type="bank"]').click();
    await expect(page.locator('[data-type="bank"]')).toHaveAttribute('aria-pressed', 'true');
    const bankCount = Number(await page.locator('[data-type="bank"] .n').textContent());
    await expect(page.locator('[data-materials-table] tbody tr')).toHaveCount(bankCount);
    await expect(page.locator('[data-materials-table] tbody tr[data-material^="lecture-"]')).toHaveCount(0);

    await page.getByLabel('Рівень Блума').selectOption('analyze');
    await expect(page.locator('[data-materials-table] tbody tr')).toHaveCount(1);
    await expect(row(page, 'bank-t01')).toBeVisible();

    await page.getByRole('button', { name: 'Скинути фільтри' }).first().click();
    await expect(count).toHaveAttribute('data-results-count', String(total));

    // Опубліковані практичні мають посилання на сторінку, ще не опубліковані — ні.
    await expect(row(page, 'practical-p01').locator('a.mat-name')).toHaveAttribute('href', `${BASE_PATH}praktychni/p01/`);
    await expect(row(page, 'practical-p02').locator('a.mat-name')).toHaveAttribute('href', `${BASE_PATH}praktychni/p02/`);
    await expect(row(page, 'practical-p03').locator('a.mat-name')).toHaveCount(0);

    await page.getByLabel('Пошук матеріалів').fill('агентські витрати');
    await expect(row(page, 'lecture-t01')).toBeVisible();
    await expect(row(page, 'glossary-t01')).toBeVisible();
    await expect(row(page, 'lecture-t02')).toHaveCount(0);

    await page.getByLabel('Пошук матеріалів').fill('');
    await page.getByLabel('Модуль').selectOption('m2');
    await expect(row(page, 'lecture-t04')).toBeVisible();
    await expect(row(page, 'lecture-t01')).toHaveCount(0);
    await expect(row(page, 'lecture-t04')).toContainText('готується');

    await page.getByLabel('Пошук матеріалів').fill('немає такого матеріалу');
    await expect(page.getByText('Нічого не знайдено.')).toBeVisible();
  });

  test('сортування таблиці: заголовки-кнопки з aria-sort, з клавіатури', async ({ page }) => {
    await openCabinet(page);
    const sizeHeader = page.locator('[data-materials-table] th').filter({ has: page.locator('[data-sort="size"]') });
    await expect(sizeHeader).not.toHaveAttribute('aria-sort', /.+/);
    await page.locator('[data-sort="size"]').focus();
    await page.keyboard.press('Enter');
    await expect(sizeHeader).toHaveAttribute('aria-sort', 'ascending');
    await page.keyboard.press('Enter');
    await expect(sizeHeader).toHaveAttribute('aria-sort', 'descending');
    await expect(page.locator('[data-materials-table] tbody tr').first()).toHaveAttribute('data-material', 'lecture-t01');
    await expect(page.locator('.results-line')).toContainText('за розміром, за спаданням');
  });

  test('режим вивантаження: вибір у таблиці й картках, формати, ZIP з README і теками', async ({ page }) => {
    await serveDownloads(page);
    await openCabinet(page);
    await page.locator('[data-export-toggle]').click();
    const line = page.locator('[data-selection-line]');
    await expect(line).toHaveText('Вибрано 0 матеріалів · 0\u00A0Б');
    await expect(page.locator('[data-build-zip]')).toBeDisabled();

    await page.locator('[data-select="lecture-t01"]').check();
    await page.locator('[data-select="bank-t01"]').check();
    await expect(page.locator('[data-select="lecture-t02"]')).toBeDisabled();
    await expect(line).toContainText('Вибрано 2 матеріали');
    await expect(row(page, 'lecture-t01')).toHaveAttribute('data-selected', 'true');

    await tab(page, 'Картки').click();
    const practicalCard = page.locator('[data-materials-cards] [data-select="practical-p01"]');
    await practicalCard.check();
    await expect(page.locator('[data-materials-cards] [data-select="lecture-t01"]')).toBeChecked();
    await expect(line).toContainText('Вибрано 3 матеріали');

    const withZip = await line.textContent();
    await page.locator('[data-format="zip"]').click();
    await expect(page.locator('[data-format="zip"]')).toHaveAttribute('aria-pressed', 'false');
    await expect(line).not.toHaveText(withZip ?? '');

    const downloadPromise = page.waitForEvent('download');
    await page.locator('[data-build-zip]').click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/^korporatyvne-upravlinnia-materialy-\d{4}-\d{2}-\d{2}\.zip$/);
    const archive = new Uint8Array(await readFile(await download.path()));
    expect(archive.byteLength).toBeGreaterThan(0);

    const files = unzipSync(archive);
    const names = Object.keys(files).sort();
    expect(names).toEqual(
      [
        'README.txt',
        `Модуль 1/Практична 01/Практична 1. Матриця моделей корпоративного управління.pdf`,
        `Модуль 1/Тема 01/${LECTURE_TITLE}.pdf`,
        'Модуль 1/Тема 01/Тренувальний тест 1 — питання Moodle XML.xml',
      ].sort(),
    );
    expect(strFromU8(files[`Модуль 1/Тема 01/${LECTURE_TITLE}.pdf`] ?? new Uint8Array())).toContain('downloads/m1/t01/lecture.pdf');
    const readme = strFromU8(files['README.txt'] ?? new Uint8Array());
    expect(readme).toContain(`Джерело: http://localhost:4322${BASE_PATH}kabinet/`);
    expect(readme).toContain(`http://localhost:4322${BASE_PATH}downloads/m1/p01/practical.pdf`);
    await expect(page.locator('[data-zip-status="done"]')).toContainText('збережено');

    await page.getByRole('button', { name: 'Зняти вибір' }).click();
    await expect(line).toContainText('Вибрано 0 матеріалів');
    await page.locator('[data-type="lecture"]').click();
    await page.locator('[data-select-filtered]').click();
    await expect(line).toContainText('Вибрано 1 матеріал ·');
  });

  test('помилка завантаження файлу: повідомлення українською, архів не зберігається', async ({ page }) => {
    await serveDownloads(page, ['/downloads/m1/t01/lecture.pdf']);
    await openCabinet(page);
    await page.locator('[data-export-toggle]').click();
    await page.locator('[data-select="lecture-t01"]').check();
    let downloaded = false;
    page.on('download', () => {
      downloaded = true;
    });
    await page.locator('[data-build-zip]').click();
    const status = page.locator('[data-zip-status="error"]');
    await expect(status).toContainText(`Не вдалося завантажити «${LECTURE_TITLE}» (помилка 404)`);
    await expect(status).toContainText('спробуйте ще раз');
    expect(downloaded).toBe(false);
  });

  test('готові пакети: пряме завантаження з base, резервна копія — зовнішня адреса; пам’ятка Moodle', async ({ page }) => {
    await openCabinet(page);
    const bundle = page.locator('[data-package="m1-bundle"]');
    await expect(bundle).toHaveAttribute('href', `${BASE_PATH}downloads/bundles/m1.zip`);
    await expect(bundle).toHaveAttribute('download', '');
    await expect(page.locator('[data-package="course-backup"]')).toHaveAttribute('href', E2E_BACKUP_URL);
    const memo = page.locator('[data-moodle-memo]');
    await expect(memo).toContainText('30–80');
    await expect(memo).toContainText('0,3');
    await memo.getByRole('link', { name: /Як завантажити курс у Moodle/ }).click();
    await expect(page).toHaveURL(new RegExp(`${BASE_PATH}moodle/$`));
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Як завантажити курс у Moodle');
  });

  for (const view of ['tablytsia', 'kartky', 'matrytsia'] as const) {
    test(`доступність і ширина сторінки: ?vid=${view} з режимом вивантаження`, async ({ page }) => {
      await openCabinet(page, `?vid=${view}`);
      const toggle = page.locator('[data-export-toggle]');
      if (await toggle.count()) await toggle.click();
      await expectNoHorizontalScroll(page);
      await expectNoSeriousAxeViolations(page);
    });
  }
});

test.describe('оглядач тренувального банку', () => {
  test('питання з типом, Блумом, правильною відповіддю й нормою; пояснення про контрольні банки', async ({ page }) => {
    await openCabinet(page);
    await row(page, 'bank-t01').getByRole('link', { name: /Питання й відповіді/ }).click();
    await expect(page).toHaveURL(/kabinet\/bank\/[a-z0-9-]+\/$/);
    const questions = page.locator('[data-question]');
    await expect(questions.first()).toBeVisible();
    expect(await questions.count()).toBeGreaterThan(5);
    await expect(questions.first().getByRole('img', { name: 'правильна відповідь' })).toHaveCount(1);
    await expect(page.locator('.bq-law').first()).toContainText('перевірено');
    await expect(page.locator('.bank-note')).toContainText('Контрольних банків на сайті немає');
    await expect(page.locator('.topbar-actions .seg a[aria-current="true"]')).toHaveText('Викладач');
    await expectNoHorizontalScroll(page);
    await expectNoSeriousAxeViolations(page);
  });
});

test.describe('сторінка «Як завантажити курс у Moodle»', () => {
  test('кроки відновлення, глосарій, файли з маніфесту; посилання у футері', async ({ page }) => {
    await page.goto('moodle/');
    await expect(page.locator('#vidnovlennia .guide-steps li')).toHaveCount(8);
    await expect(page.locator('#hlosarii')).toContainText('Імпорт записів');
    await expect(page.locator('#mova')).toContainText('Примусова мова');
    await expect(page.locator('#testy')).toContainText('дату закриття');
    await expect(page.locator('#zapasni-shliakhy')).toContainText('Moodle XML');
    await expect(page.locator('[data-file="course-backup"]')).toHaveAttribute('href', E2E_BACKUP_URL);
    await expect(page.locator('[data-file="t01-glossary-xml"]')).toHaveAttribute('href', `${BASE_PATH}downloads/m1/t01/glossary.xml`);
    await expect(page.locator('[data-file="t01-book-zip"]')).toBeVisible();
    await expect(page.locator('[data-guide-missing]')).toHaveCount(0);
    await expect(page.locator('.footer').getByRole('link', { name: 'Як завантажити курс у Moodle' })).toHaveAttribute('href', `${BASE_PATH}moodle/`);
    await expectNoHorizontalScroll(page);
    await expectNoSeriousAxeViolations(page);
  });
});
