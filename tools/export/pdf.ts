import { chromium, type Browser, type BrowserContext, type Route } from '@playwright/test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, extname, resolve, sep } from 'node:path';
import { escapeHtmlText } from './html-tree.ts';

/**
 * PDF матеріалів курсу: Playwright (Chromium) друкує сторінки зібраного сайту у формат A4 з print CSS сайту.
 * Сайт віддається з диска через перехоплення запитів на вигаданий домен `.invalid`, тож не потрібні ні порт,
 * ні мережа; запит за межі сайту або відсутній файл зупиняє друк, щоб у PDF не потрапила сторінка без стилів
 * чи шрифтів. Колонтитули — системним шрифтом (у шаблонах колонтитулів Chromium вебшрифти недоступні).
 * Chromium пише в PDF час створення, тож дати замінюються датою збірки: однаковий вхід — однаковий файл.
 */

export const PRINT_ORIGIN = 'http://print.invalid';
/** Поля — як у print.css сайту (`@page { margin: 18mm 16mm }`), щоб колонтитули мали місце. */
const MARGIN = { top: '18mm', bottom: '18mm', left: '16mm', right: '16mm' } as const;
const NAVIGATION_TIMEOUT_MS = 60_000;
const SITE_FONT_FAMILY = 'Open Sans';
const SYSTEM_FONTS = "'Liberation Sans', Arial, 'Helvetica Neue', Helvetica, sans-serif";

const CONTENT_TYPES: Readonly<Record<string, string>> = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml',
};

export interface PrintJob {
  /** Шлях сторінки від base сайту, наприклад `temy/<slug>/`. */
  readonly page: string;
  readonly outFile: string;
}

export interface PrintOptions {
  readonly siteDir: string;
  /** base сайту з обома скісними рисками: `/korporatyvne-upravlinnia/`. */
  readonly basePath: string;
  /** Назва курсу й закладу для нижнього колонтитула. */
  readonly footerText: string;
  /** Дата збірки для метаданих PDF. */
  readonly date: Date;
  /** Сторінки, яких немає в зібраному сайті: шлях від base → HTML. */
  readonly extraPages?: ReadonlyMap<string, string>;
}

export interface PrintedPdf {
  readonly outFile: string;
  readonly bytes: number;
  readonly pages: number;
}

export function headerTemplate(): string {
  return `<div style="font-family: ${SYSTEM_FONTS}; font-size: 8pt; color: #444; width: 100%; padding: 0 16mm; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;"><span class="title"></span></div>`;
}

export function footerTemplate(footerText: string): string {
  return (
    `<div style="font-family: ${SYSTEM_FONTS}; font-size: 8pt; color: #444; width: 100%; padding: 0 16mm; display: flex; justify-content: space-between;">` +
    `<span>${escapeHtmlText(footerText)}</span><span>с. <span class="pageNumber"></span> з <span class="totalPages"></span></span></div>`
  );
}

/** `D:20260917124325+00'00'` → дата збірки тієї самої довжини: зміщення в таблиці xref лишаються правильними. */
export function normalizePdfDates(pdf: Buffer, date: Date): Buffer {
  const iso = date.toISOString();
  const stamp = `D:${iso.slice(0, 4)}${iso.slice(5, 7)}${iso.slice(8, 10)}${iso.slice(11, 13)}${iso.slice(14, 16)}${iso.slice(17, 19)}+00'00'`;
  const text = pdf.toString('latin1').replace(/\/(CreationDate|ModDate) \(D:\d{14}[^)]*\)/g, (match, key: string) => {
    const replacement = `/${key} (${stamp})`;
    return replacement.length === match.length ? replacement : match;
  });
  return Buffer.from(text, 'latin1');
}

/** Кількість сторінок — найбільше значення /Count у дереві сторінок. */
export function countPdfPages(pdf: Buffer): number {
  const counts = [...pdf.toString('latin1').matchAll(/\/Type\s*\/Pages\b[^>]*?\/Count\s+(\d+)/g)].map((match) => Number(match[1]));
  return counts.length === 0 ? 0 : Math.max(...counts);
}

/** Файл сайту для шляху запиту або null, якщо шлях поза base чи виходить за межі каталогу сайту. */
export function siteFileFor(siteDir: string, basePath: string, pathname: string): string | null {
  if (!pathname.startsWith(basePath)) return null;
  const relative = decodeURIComponent(pathname.slice(basePath.length));
  const withIndex = relative === '' || relative.endsWith('/') ? `${relative}index.html` : relative;
  const root = resolve(siteDir);
  const file = resolve(root, withIndex);
  return file.startsWith(`${root}${sep}`) ? file : null;
}

async function launch(): Promise<Browser> {
  try {
    return await chromium.launch();
  } catch (error) {
    const reason = error instanceof Error ? error.message.split('\n')[0] : String(error);
    throw new Error(`Не вдалося запустити Chromium для друку PDF (${reason}). Встановіть браузер: npx playwright install chromium`);
  }
}

interface RouteLog {
  readonly failures: string[];
}

async function serve(route: Route, options: PrintOptions, log: RouteLog): Promise<void> {
  const url = new URL(route.request().url());
  if (url.origin !== PRINT_ORIGIN) {
    log.failures.push(`зовнішній запит ${url.href}`);
    return route.abort('blockedbyclient');
  }
  const extra = options.extraPages?.get(url.pathname.slice(options.basePath.length));
  if (extra !== undefined) return route.fulfill({ body: extra, contentType: CONTENT_TYPES['.html'] });
  const file = siteFileFor(options.siteDir, options.basePath, url.pathname);
  const body = file === null ? null : await readFile(file).catch(() => null);
  if (file === null || body === null) {
    log.failures.push(`немає файлу для ${url.pathname}`);
    return route.fulfill({ status: 404, body: '' });
  }
  return route.fulfill({ body, contentType: CONTENT_TYPES[extname(file)] ?? 'application/octet-stream' });
}

async function printOne(context: BrowserContext, job: PrintJob, options: PrintOptions, log: RouteLog): Promise<Buffer> {
  const page = await context.newPage();
  try {
    await page.emulateMedia({ media: 'print' });
    const response = await page.goto(`${PRINT_ORIGIN}${options.basePath}${job.page}`, { waitUntil: 'load', timeout: NAVIGATION_TIMEOUT_MS });
    if (!response?.ok()) throw new Error(`сторінка ${job.page} не відкрилася (HTTP ${response?.status() ?? 'без відповіді'})`);
    await page.evaluate(async () => {
      const images = [...document.images].map((image) => {
        image.loading = 'eager';
        return image.complete ? Promise.resolve() : image.decode().catch(() => undefined);
      });
      await Promise.all(images);
      await document.fonts.ready;
    });
    // Кириличний піднабір шрифту сайту має діапазон з U+0400; без нього PDF вийшов би системним шрифтом.
    const hasFont = await page.evaluate(
      (family) => [...document.fonts].some((face) => face.family.replace(/["']/g, '') === family && face.status === 'loaded' && /U\+0*400/i.test(face.unicodeRange)),
      SITE_FONT_FAMILY,
    );
    if (!hasFont) throw new Error(`на сторінці ${job.page} не завантажився шрифт Open Sans з кирилицею`);
    if (log.failures.length > 0) throw new Error(`сторінка ${job.page}: ${log.failures.join('; ')}`);
    const pdf = await page.pdf({
      format: 'A4',
      printBackground: true,
      tagged: true,
      outline: true,
      displayHeaderFooter: true,
      headerTemplate: headerTemplate(),
      footerTemplate: footerTemplate(options.footerText),
      margin: MARGIN,
    });
    return normalizePdfDates(pdf, options.date);
  } finally {
    await page.close();
  }
}

/** Друкує сторінки по черзі в одному браузері; помилка будь-якої сторінки зупиняє друк. */
export async function printPdfs(jobs: readonly PrintJob[], options: PrintOptions): Promise<PrintedPdf[]> {
  if (jobs.length === 0) return [];
  const browser = await launch();
  try {
    const context = await browser.newContext({ locale: 'uk-UA' });
    const printed: PrintedPdf[] = [];
    for (const job of jobs) {
      const log: RouteLog = { failures: [] };
      await context.unrouteAll();
      await context.route('**/*', (route) => serve(route, options, log));
      const pdf = await printOne(context, job, options, log);
      await mkdir(dirname(job.outFile), { recursive: true });
      await writeFile(job.outFile, pdf);
      printed.push({ outFile: job.outFile, bytes: pdf.length, pages: countPdfPages(pdf) });
    }
    return printed;
  } finally {
    await browser.close();
  }
}
