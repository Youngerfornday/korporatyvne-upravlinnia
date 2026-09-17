import { chromium } from '@playwright/test';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { countPdfPages, footerTemplate, headerTemplate, normalizePdfDates, printPdfs, siteFileFor, type PrintOptions } from './pdf.ts';

/**
 * Друк PDF: чисті функції і справжній Chromium на крихітному сайті з кириличним шрифтом сайту.
 * Кирилицю в PDF перевіряє `pdftotext` (poppler-utils). Без браузера чи poppler інтеграційні тести
 * пропускаються з поясненням; у CI обидва встановлюються перед тестами.
 */

const BASE = '/kurs/';
const DATE = new Date('2026-09-16T00:00:00.000Z');
const FONTS = new URL('../../public/fonts/', import.meta.url);
const hasChromium = existsSync(chromium.executablePath());
const hasPoppler = spawnSync('pdftotext', ['-v']).error === undefined;

describe('чисті функції друку', () => {
  test('дати створення й зміни замінюються датою збірки без зміни довжини файлу', () => {
    const pdf = Buffer.from("%PDF-1.4\n<< /CreationDate (D:20260917124325+00'00') /ModDate (D:20260917124325+00'00') >>", 'latin1');
    const normalized = normalizePdfDates(pdf, DATE);
    expect(normalized.length).toBe(pdf.length);
    expect(normalized.toString('latin1')).toContain("/CreationDate (D:20260916000000+00'00') /ModDate (D:20260916000000+00'00')");
    const odd = Buffer.from('/CreationDate (D:20260917124325Z)', 'latin1');
    expect(normalizePdfDates(odd, DATE).equals(odd)).toBe(true);
  });

  test('кількість сторінок — найбільший /Count дерева сторінок', () => {
    expect(countPdfPages(Buffer.from('<< /Type /Pages /Count 3 /Kids [] >> << /Type /Pages /Count 41 >>', 'latin1'))).toBe(41);
    expect(countPdfPages(Buffer.from('%PDF-1.4', 'latin1'))).toBe(0);
  });

  test('шлях запиту відображається на файл сайту лише в межах base і каталогу', () => {
    expect(siteFileFor('/site', BASE, '/kurs/')).toBe('/site/index.html');
    expect(siteFileFor('/site', BASE, '/kurs/temy/t/')).toBe('/site/temy/t/index.html');
    expect(siteFileFor('/site', BASE, '/kurs/fonts/%D1%88.woff2')).toBe('/site/fonts/ш.woff2');
    expect(siteFileFor('/site', BASE, '/other/')).toBeNull();
    expect(siteFileFor('/site', BASE, '/kurs/..%2F..%2Fetc/passwd')).toBeNull();
  });

  test('колонтитули системним шрифтом, текст екранується', () => {
    expect(headerTemplate()).toContain('class="title"');
    const footer = footerTemplate('Курс <A&B>');
    expect(footer).toContain('Курс &lt;A&amp;B&gt;');
    expect(footer).toContain('class="pageNumber"');
    expect(footer).not.toContain('Open Sans');
  });
});

const FONT_FACE = `<style>
@font-face { font-family: "Open Sans"; src: url("${BASE}fonts/OpenSans-Variable-cyrillic.woff2") format("woff2"); unicode-range: U+0301, U+0400-045F, U+0490-0491, U+04B0-04B1, U+2116; }
@font-face { font-family: "Open Sans"; src: url("${BASE}fonts/OpenSans-Variable-latin.woff2") format("woff2"); unicode-range: U+0000-00FF; }
body { font-family: "Open Sans", sans-serif; }
@media print { h2 { break-before: page; } }
</style>`;

function page(title: string, body: string, head = FONT_FACE): string {
  return `<!DOCTYPE html><html lang="uk"><head><meta charset="utf-8"><title>${title}</title>${head}</head><body>${body}</body></html>`;
}

describe.skipIf(!hasChromium)('друк у Chromium', () => {
  let site: string;
  let out: string;
  let options: PrintOptions;

  beforeAll(async () => {
    site = await mkdtemp(join(tmpdir(), 'ku-pdf-site-'));
    out = await mkdtemp(join(tmpdir(), 'ku-pdf-out-'));
    await mkdir(join(site, 'fonts'), { recursive: true });
    await copyFile(new URL('OpenSans-Variable-cyrillic.woff2', FONTS), join(site, 'fonts/OpenSans-Variable-cyrillic.woff2'));
    await copyFile(new URL('OpenSans-Variable-latin.woff2', FONTS), join(site, 'fonts/OpenSans-Variable-latin.woff2'));
    await mkdir(join(site, 'tema'), { recursive: true });
    await writeFile(join(site, 'tema/index.html'), page('Тема 1. Агентська проблема', '<h1>Агентська проблема</h1><p>Відокремлення власності від контролю — ґрунт для конфлікту інтересів.</p><h2>Стейкхолдери</h2><p>Кредитори, працівники, держава.</p>'));
    await mkdir(join(site, 'broken'), { recursive: true });
    await writeFile(join(site, 'broken/index.html'), page('Зламана', '<p>Текст</p>', `${FONT_FACE}<link rel="stylesheet" href="${BASE}missing.css">`));
    await mkdir(join(site, 'external'), { recursive: true });
    await writeFile(join(site, 'external/index.html'), page('Зовнішня', '<p>Текст</p><img src="https://example.com/logo.png" alt="">'));
    await mkdir(join(site, 'nofont'), { recursive: true });
    await writeFile(join(site, 'nofont/index.html'), page('Без шрифту', '<p>Текст</p>', '<style>body { font-family: serif; }</style>'));
    options = {
      siteDir: site,
      basePath: BASE,
      footerText: 'Корпоративне управління · НУ «Чернігівська політехніка»',
      date: DATE,
      extraPages: new Map([['practical/p01/', page('Практична робота 1', '<h1>Рубрика оцінювання</h1><table><tr><th>Критерій</th><th>Бали</th></tr><tr><td>Матриця моделей</td><td>1</td></tr></table>')]]),
    };
  });

  afterAll(async () => {
    await rm(site, { recursive: true, force: true });
    await rm(out, { recursive: true, force: true });
  });

  test('A4, теги доступності, закладки, кирилиця шрифтом сайту й колонтитули; повторний друк — ті самі байти', async () => {
    const jobs = [
      { page: 'tema/', outFile: join(out, 'm1/lecture.pdf') },
      { page: 'practical/p01/', outFile: join(out, 'm1/practical.pdf') },
    ];
    const printed = await printPdfs(jobs, options);
    expect(printed.map((pdf) => pdf.outFile)).toEqual(jobs.map((job) => job.outFile));
    expect(printed[0]?.pages).toBe(2);
    const lecture = await readFile(jobs[0]?.outFile ?? '');
    expect(printed[0]?.bytes).toBe(lecture.length);
    expect(lecture.toString('latin1')).toContain("/CreationDate (D:20260916000000+00'00')");
    expect(lecture.toString('latin1')).toContain('/Outlines');

    const again = await printPdfs(jobs.slice(0, 1), options);
    expect((await readFile(again[0]?.outFile ?? '')).equals(lecture)).toBe(true);

    if (!hasPoppler) return;
    const info = execFileSync('pdfinfo', [jobs[0]?.outFile ?? ''], { encoding: 'utf8' });
    expect(info).toMatch(/Tagged:\s+yes/);
    expect(info).toMatch(/Page size:\s+595\.\d+ x 841\.\d+ pts \(A4\)|Page size:\s+595\.\d+ x 842\.\d+ pts \(A4\)/);
    const text = execFileSync('pdftotext', ['-enc', 'UTF-8', jobs[0]?.outFile ?? '', '-'], { encoding: 'utf8' });
    expect(text).toContain('Відокремлення власності від контролю');
    expect(text).toContain('ґрунт для конфлікту інтересів');
    expect(text).toContain('Корпоративне управління · НУ «Чернігівська політехніка»');
    expect(text).toMatch(/с\. 1 з 2/);
    const fonts = execFileSync('pdffonts', [jobs[0]?.outFile ?? ''], { encoding: 'utf8' });
    expect(fonts).toContain('OpenSans');
    const practical = execFileSync('pdftotext', ['-enc', 'UTF-8', jobs[1]?.outFile ?? '', '-'], { encoding: 'utf8' });
    expect(practical).toContain('Рубрика оцінювання');
    expect(practical).toContain('Матриця моделей');
  }, 90_000);

  test('відсутній файл сайту, зовнішній запит чи шрифт без кирилиці зупиняють друк з поясненням', async () => {
    await expect(printPdfs([{ page: 'broken/', outFile: join(out, 'broken.pdf') }], options)).rejects.toThrow('немає файлу для /kurs/missing.css');
    await expect(printPdfs([{ page: 'external/', outFile: join(out, 'external.pdf') }], options)).rejects.toThrow('зовнішній запит https://example.com/logo.png');
    await expect(printPdfs([{ page: 'nofont/', outFile: join(out, 'nofont.pdf') }], options)).rejects.toThrow('не завантажився шрифт Open Sans з кирилицею');
    await expect(printPdfs([{ page: 'nema/', outFile: join(out, 'nema.pdf') }], options)).rejects.toThrow('сторінка nema/ не відкрилася (HTTP 404)');
    expect(existsSync(join(out, 'broken.pdf'))).toBe(false);
  }, 90_000);

  test('порожній список завдань не запускає браузер', async () => {
    await expect(printPdfs([], options)).resolves.toEqual([]);
  });
});
