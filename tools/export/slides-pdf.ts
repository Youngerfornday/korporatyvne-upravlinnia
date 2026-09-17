import { chromium, type Browser, type BrowserContext, type Route } from '@playwright/test';
import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import { extname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { parse } from 'yaml';
import { CourseSchema, type Course } from '../../src/content/schemas/course.ts';
import { SlidesFileSchema } from '../../src/content/schemas/slides.ts';
import { readSiteUrl } from './site-url.ts';

/**
 * npm run export:slides-pdf — PDF презентацій тем зі зібраного сайту.
 * Playwright (Chromium) друкує веб-режим `temy/<slug>/prezentatsiia/` з print CSS сторінки: один слайд 16:9 на сторінку,
 * без інтерфейсу й нотаток, теговий PDF із закладками за заголовками слайдів → dist-export/slides/<tNN>-<slug>.pdf.
 *   --dist <каталог>   зібраний сайт (типово dist)
 *   --out <каталог>    куди писати PDF (типово dist-export/slides; інші файли каталогу не чіпаються)
 *   --topic <tNN>      лише ця тема (можна повторити)
 * Сайт віддається з диска через перехоплення запитів на домен `.invalid`: ні порту, ні мережі. Запит поза сайт,
 * відсутній файл або шрифт без кирилиці зупиняє друк, щоб у PDF не потрапила сторінка без стилів.
 * Код 0 — усе надруковано; 1 — немає сторінки, презентації чи браузера; 2 — неправильні аргументи.
 */

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const USAGE = 'Використання: node --import ./tools/export/register-ts.mjs tools/export/slides-pdf.ts [--dist <каталог>] [--out <каталог>] [--topic <tNN>]…';
export const PRINT_ORIGIN = 'http://slides.invalid';
const NAVIGATION_TIMEOUT_MS = 60_000;
const SITE_FONT_FAMILY = 'Open Sans';
const CONTENT_TYPES: Readonly<Record<string, string>> = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
  '.json': 'application/json; charset=utf-8',
};

export interface SlidesPdfJob {
  readonly topic: string;
  readonly slug: string;
  /** Шлях сторінки від base сайту. */
  readonly page: string;
  readonly slides: number;
  readonly outFile: string;
}

export interface PrintedSlidesPdf {
  readonly job: SlidesPdfJob;
  readonly bytes: number;
}

export function slidesPdfName(topic: string, slug: string): string {
  return `${topic}-${slug}.pdf`;
}

/** Файл сайту для шляху запиту або null, якщо шлях поза base чи виходить за межі каталогу сайту. */
export function siteFileFor(siteDir: string, basePath: string, pathname: string): string | null {
  if (!pathname.startsWith(basePath)) return null;
  const relativePath = decodeURIComponent(pathname.slice(basePath.length));
  const withIndex = relativePath === '' || relativePath.endsWith('/') ? `${relativePath}index.html` : relativePath;
  const root = resolve(siteDir);
  const file = resolve(root, withIndex);
  return file.startsWith(`${root}${sep}`) ? file : null;
}

/** Теми реєстру, для яких написано slides.yaml: сторінка веб-режиму, кількість слайдів і файл PDF. */
export async function planSlidesPdf(course: Course, contentRoot: string, outDir: string, only: readonly string[] = []): Promise<SlidesPdfJob[]> {
  const unknown = only.filter((id) => !course.topics.some((topic) => topic.id === id));
  if (unknown.length > 0) throw new Error(`Теми ${unknown.join(', ')} немає в реєстрі курсу`);
  const topics = course.topics.filter((topic) => only.length === 0 || only.includes(topic.id));
  const jobs: SlidesPdfJob[] = [];
  for (const topic of topics) {
    const file = join(contentRoot, 'content', 'modules', topic.module, topic.id, 'slides.yaml');
    const text = await readFile(file, 'utf8').catch(() => null);
    if (text === null) {
      if (only.includes(topic.id)) throw new Error(`Для теми ${topic.id} немає презентації ${relative(contentRoot, file)}`);
      continue;
    }
    const parsed = SlidesFileSchema.safeParse(parse(text));
    if (!parsed.success) throw new Error(`${relative(contentRoot, file)} не проходить схему: ${parsed.error.issues.map((issue) => issue.message).join('; ')}`);
    jobs.push({
      topic: topic.id,
      slug: topic.slug,
      page: `temy/${topic.slug}/prezentatsiia/`,
      slides: parsed.data.slides.length,
      outFile: join(outDir, slidesPdfName(topic.id, topic.slug)),
    });
  }
  return jobs;
}

async function serve(route: Route, siteDir: string, basePath: string, failures: string[]): Promise<void> {
  const url = new URL(route.request().url());
  if (url.origin !== PRINT_ORIGIN) {
    failures.push(`зовнішній запит ${url.href}`);
    return route.abort('blockedbyclient');
  }
  const file = siteFileFor(siteDir, basePath, url.pathname);
  const body = file === null ? null : await readFile(file).catch(() => null);
  if (file === null || body === null) {
    failures.push(`немає файлу для ${url.pathname}`);
    return route.fulfill({ status: 404, body: '' });
  }
  return route.fulfill({ body, contentType: CONTENT_TYPES[extname(file)] ?? 'application/octet-stream' });
}

async function printOne(context: BrowserContext, job: SlidesPdfJob, basePath: string, failures: string[]): Promise<Buffer> {
  const page = await context.newPage();
  try {
    await page.emulateMedia({ media: 'print', colorScheme: 'light' });
    const response = await page.goto(`${PRINT_ORIGIN}${basePath}${job.page}`, { waitUntil: 'load', timeout: NAVIGATION_TIMEOUT_MS });
    if (!response?.ok()) throw new Error(`сторінка ${job.page} не відкрилася (HTTP ${response?.status() ?? 'без відповіді'})`);
    // Зображення вже завантажено до події load. Шрифти вантажаться ліниво: примусово завантажуємо всі піднабори,
    // потім чекаємо document.fonts.ready. (image.decode() тут не годиться: для схованого логотипа темної теми не завершується.)
    await page.evaluate(async () => {
      await Promise.all([...document.fonts].map((face) => face.load().catch(() => undefined)));
      await document.fonts.ready;
    });
    const hasCyrillicFont = await page.evaluate(
      (family) => [...document.fonts].some((face) => face.family.replace(/["']/g, '') === family && face.status === 'loaded' && /U\+0*400/i.test(face.unicodeRange)),
      SITE_FONT_FAMILY,
    );
    if (!hasCyrillicFont) throw new Error(`на сторінці ${job.page} не завантажився шрифт ${SITE_FONT_FAMILY} з кирилицею`);
    const printed = await page.locator('.slide-frame').count();
    if (printed !== job.slides) throw new Error(`на сторінці ${job.page} ${printed} слайдів, а в slides.yaml — ${job.slides}: перезберіть сайт`);
    if (failures.length > 0) throw new Error(`сторінка ${job.page}: ${failures.join('; ')}`);
    return await page.pdf({ preferCSSPageSize: true, printBackground: true, tagged: true, outline: true });
  } finally {
    await page.close();
  }
}

async function launch(): Promise<Browser> {
  try {
    return await chromium.launch();
  } catch (error) {
    const reason = error instanceof Error ? error.message.split('\n')[0] : String(error);
    throw new Error(`Не вдалося запустити Chromium (${reason}). Встановіть браузер: npx playwright install chromium`);
  }
}

/** Друкує презентації по черзі в одному браузері; помилка будь-якої зупиняє друк. */
export async function printSlidesPdfs(jobs: readonly SlidesPdfJob[], siteDir: string, basePath: string): Promise<PrintedSlidesPdf[]> {
  for (const job of jobs) {
    const page = siteFileFor(siteDir, basePath, `${basePath}${job.page}`);
    if (page === null || !(await access(page).then(() => true, () => false))) {
      throw new Error(`немає сторінки ${job.page} у ${siteDir}: спершу зберіть сайт (npm run build)`);
    }
  }
  if (jobs.length === 0) return [];
  const browser = await launch();
  try {
    const context = await browser.newContext({ locale: 'uk-UA', colorScheme: 'light', reducedMotion: 'reduce' });
    const results: PrintedSlidesPdf[] = [];
    for (const job of jobs) {
      const failures: string[] = [];
      await context.unrouteAll();
      await context.route('**/*', (route) => serve(route, siteDir, basePath, failures));
      const pdf = await printOne(context, job, basePath, failures);
      await writeFile(job.outFile, pdf);
      results.push({ job, bytes: pdf.length });
    }
    return results;
  } finally {
    await browser.close();
  }
}

interface CliOptions {
  readonly distDir: string;
  readonly outDir: string;
  readonly topics: readonly string[];
}

function parseOptions(argv: readonly string[], cwd: string): CliOptions | 'help' {
  const { values } = parseArgs({
    args: [...argv],
    options: { dist: { type: 'string' }, out: { type: 'string' }, topic: { type: 'string', multiple: true }, help: { type: 'boolean', short: 'h' } },
    strict: true,
    allowPositionals: false,
  });
  if (values.help) return 'help';
  const path = (value: string | undefined, fallback: string): string => (value === undefined ? join(ROOT, fallback) : resolve(cwd, value));
  return { distDir: path(values.dist, 'dist'), outDir: path(values.out, 'dist-export/slides'), topics: values.topic ?? [] };
}

type Io = { stdout: (line: string) => void; stderr: (line: string) => void };
const PROCESS_IO: Io = { stdout: (line) => process.stdout.write(`${line}\n`), stderr: (line) => process.stderr.write(`${line}\n`) };

export async function runSlidesPdfCli(argv: readonly string[], io: Io = PROCESS_IO, cwd: string = process.cwd()): Promise<number> {
  let options: CliOptions | 'help';
  try {
    options = parseOptions(argv, cwd);
  } catch (error) {
    io.stderr(error instanceof Error ? error.message : String(error));
    io.stderr(USAGE);
    return 2;
  }
  if (options === 'help') {
    io.stdout(USAGE);
    return 0;
  }
  try {
    const course = CourseSchema.parse(parse(await readFile(join(ROOT, 'content/course.yaml'), 'utf8')));
    const basePath = new URL(await readSiteUrl(join(ROOT, 'astro.config.mjs'))).pathname;
    const jobs = await planSlidesPdf(course, ROOT, options.outDir, options.topics);
    await mkdir(options.outDir, { recursive: true });
    const printed = await printSlidesPdfs(jobs, options.distDir, basePath);
    io.stdout(`PDF презентацій: ${printed.length} у ${relative(cwd, options.outDir) || '.'}`);
    for (const { job, bytes } of printed) io.stdout(`  ${relative(cwd, job.outFile)}: слайдів ${job.slides}, ${Math.round(bytes / 1024)} КБ`);
    return 0;
  } catch (error) {
    io.stderr(`export:slides-pdf: ${error instanceof Error ? error.message : String(error)}`);
    return 1;
  }
}

if (import.meta.main) {
  process.exitCode = await runSlidesPdfCli(process.argv.slice(2));
}
