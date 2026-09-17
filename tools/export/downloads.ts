import { execFile } from 'node:child_process';
import { cp, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs, promisify } from 'node:util';
import { DownloadManifestSchema, type DownloadItem, type DownloadManifest } from '../../src/content/schemas/downloads.ts';
import { pluralUk } from '../../src/lib/plural.ts';
import { formatSize } from './downloads-bundle.ts';
import { orderItems } from './downloads-items.ts';
import { loadDownloadSources, type DownloadSources } from './downloads-sources.ts';
import { booksStep, bundlesStep, docxStep, moodleXmlStep, pdfStep, scormStep, topicXmlStep, type BuildScorm, type PrintPdfs, type StepContext } from './downloads-steps.ts';
import { buildSlideDecks, slidesStep, type BuildSlides } from './downloads-slides.ts';
import { checkDownloadsDir, MANIFEST_FILE } from './downloads-verify.ts';
import { printPdfs } from './pdf.ts';
import { buildScormPackages } from './scorm/build.ts';
import { readSiteUrl } from './site-url.ts';

/**
 * npm run build:downloads — матеріали для вивантаження в `public/downloads/`:
 * PDF лекцій і практичних, презентації лекцій PPTX і PDF, силабус і робоча програма DOCX, Moodle XML питань і глосарію, ZIP глав Книги,
 * пакети SCORM 1.2 тренажерів, пакети модуля й курсу, посилання на резервну копію `.mbz` у GitHub Releases і `manifest.json` за схемою.
 *   --dist <каталог>  готовий зібраний сайт (типово сайт збирається в тимчасовий каталог)
 *   --out <каталог>   куди писати (типово public/downloads)
 * Усе генерується в тимчасовий каталог і переноситься в --out лише після перевірки маніфесту, тож при
 * падінні будь-якого кроку попередні матеріали лишаються як були. Код 0 — готово; 1 — помилка кроку; 2 — аргументи.
 */

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const USAGE = 'Використання: npm run build:downloads -- [--dist <каталог зібраного сайту>] [--out <каталог>]';
const BUILD_OUTPUT_TAIL = 30;
const ITEM_FORMS = { one: 'матеріал', few: 'матеріали', many: 'матеріалів', other: 'матеріалу' };

export interface DownloadsIo {
  readonly stdout: (line: string) => void;
  readonly stderr: (line: string) => void;
}

export interface DownloadsDeps {
  /** Збирає сайт у каталог; типово `astro build --outDir`. */
  readonly buildSite: (root: string, outDir: string) => Promise<void>;
  readonly printPdfs: PrintPdfs;
  /** Пакети SCORM тренажерів; типово — Vite-збірка tools/export/scorm. */
  readonly buildScorm: BuildScorm;
  /** Презентації тем із slides.yaml (PPTX і PDF); типово — tools/export/slides і slides-pdf.ts. */
  readonly buildSlides: BuildSlides;
}

export interface DownloadsOptions {
  readonly root: string;
  readonly outDir: string;
  readonly distDir: string | undefined;
}

class StepError extends Error {
  readonly step: string;

  constructor(step: string, cause: unknown) {
    super(cause instanceof Error ? cause.message : String(cause));
    this.step = step;
  }
}

async function step<T>(name: string, io: DownloadsIo, run: () => Promise<T>): Promise<T> {
  io.stdout(`• ${name}`);
  try {
    return await run();
  } catch (error) {
    throw new StepError(name, error);
  }
}

const execFileAsync = promisify(execFile);

export async function astroBuild(root: string, outDir: string): Promise<void> {
  try {
    await execFileAsync(join(root, 'node_modules/.bin/astro'), ['build', '--outDir', outDir], { cwd: root, maxBuffer: 64 * 1024 * 1024 });
  } catch (error) {
    const output = error instanceof Error && 'stdout' in error ? `${String(error.stdout)}\n${String((error as { stderr?: unknown }).stderr ?? '')}` : String(error);
    throw new Error(`astro build завершився з помилкою:\n${output.trim().split('\n').slice(-BUILD_OUTPUT_TAIL).join('\n')}`);
  }
}

const defaultDeps: DownloadsDeps = { buildSite: astroBuild, printPdfs, buildScorm: buildScormPackages, buildSlides: buildSlideDecks };

function manifestOf(sources: DownloadSources, items: readonly DownloadItem[]): DownloadManifest {
  const parsed = DownloadManifestSchema.safeParse({ schemaVersion: 1, generatedAt: sources.date.toISOString(), items: orderItems(sources.course, items) });
  if (!parsed.success) {
    throw new Error(`маніфест не відповідає схемі:\n${parsed.error.issues.map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`).join('\n')}`);
  }
  return parsed.data;
}

async function publish(stagingDir: string, outDir: string): Promise<void> {
  await rm(outDir, { recursive: true, force: true });
  await mkdir(dirname(outDir), { recursive: true });
  await cp(stagingDir, outDir, { recursive: true });
}

/** Генерує матеріали й повертає маніфест; помилка кроку — StepError з назвою кроку. */
export async function generateDownloads(options: DownloadsOptions, io: DownloadsIo, deps: DownloadsDeps = defaultDeps): Promise<DownloadManifest> {
  const workDir = await mkdtemp(join(tmpdir(), 'ku-downloads-'));
  try {
    const sources = await step('Реєстр курсу, практичні й резервна копія', io, () => loadDownloadSources(options.root));
    const siteUrl = await step('Адреса сайту з astro.config.mjs', io, () => readSiteUrl(join(options.root, 'astro.config.mjs')));
    const siteDir = options.distDir ?? join(workDir, 'site');
    if (options.distDir === undefined) await step('Збірка сайту в тимчасовий каталог', io, () => deps.buildSite(options.root, siteDir));
    const ctx: StepContext = { root: options.root, sources, siteDir, siteUrl, workDir, stagingDir: join(workDir, 'downloads'), warn: io.stderr };

    const xml = await step('Moodle XML: тренувальні питання й глосарій', io, () => moodleXmlStep(ctx));
    const topicXml = await step('Moodle XML тем: питання й глосарій кожної опублікованої теми', io, () => topicXmlStep(ctx));
    const books = await step('ZIP глав Книги', io, () => booksStep(ctx));
    const pdfs = await step('PDF лекцій і практичних (Playwright)', io, () => pdfStep(ctx, deps.printPdfs));
    const slides = await step('Презентації лекцій: PPTX і PDF', io, () => slidesStep(ctx, deps.buildSlides));
    const docs = await step('Силабус і робоча програма DOCX', io, () => docxStep(ctx));
    const scorm = await step('Пакети SCORM 1.2 тренажерів (Vite)', io, () => scormStep(ctx, deps.buildScorm));
    const files = [...docs, ...pdfs, ...slides, ...books, ...xml, ...topicXml, ...scorm];
    const bundles = await step('Пакети модулів і курсу', io, () => bundlesStep(ctx, files));
    const manifest = await step('Маніфест', io, async () => {
      const built = manifestOf(sources, [...files, ...bundles]);
      await writeFile(join(ctx.stagingDir, MANIFEST_FILE), `${JSON.stringify(built, null, 2)}\n`, 'utf8');
      const { issues } = await checkDownloadsDir(ctx.stagingDir);
      if (issues.length > 0) throw new Error(issues.join('\n'));
      return built;
    });
    await step(`Публікація в ${relative(options.root, options.outDir) || options.outDir}`, io, () => publish(ctx.stagingDir, options.outDir));
    return manifest;
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
}

function summary(manifest: DownloadManifest, io: DownloadsIo): void {
  io.stdout(`Матеріали готові: ${pluralUk(manifest.items.length, ITEM_FORMS)} у маніфесті.`);
  for (const item of manifest.items) io.stdout(`  ${(item.path ?? item.url ?? '').padEnd(48)} ${formatSize(item.bytes).padStart(9)}  ${item.title}`);
}

export async function runDownloads(argv: readonly string[], io: DownloadsIo, cwd: string = process.cwd(), deps: DownloadsDeps = defaultDeps): Promise<number> {
  let values: { dist?: string | undefined; out?: string | undefined; help?: boolean | undefined };
  try {
    ({ values } = parseArgs({
      args: [...argv],
      options: { dist: { type: 'string' }, out: { type: 'string' }, help: { type: 'boolean', short: 'h' } },
      strict: true,
      allowPositionals: false,
    }));
  } catch (error) {
    io.stderr(error instanceof Error ? error.message : String(error));
    io.stderr(USAGE);
    return 2;
  }
  if (values.help === true) {
    io.stdout(USAGE);
    return 0;
  }
  const options: DownloadsOptions = {
    root: ROOT,
    outDir: values.out === undefined ? join(ROOT, 'public/downloads') : resolve(cwd, values.out),
    distDir: values.dist === undefined ? undefined : resolve(cwd, values.dist),
  };
  try {
    summary(await generateDownloads(options, io, deps), io);
    return 0;
  } catch (error) {
    const stepName = error instanceof StepError ? error.step : 'підготовка';
    const message = error instanceof Error ? error.message : String(error);
    io.stderr(`Матеріали для вивантаження не згенеровано: крок «${stepName}» завершився помилкою.`);
    for (const line of message.split('\n')) io.stderr(`  ${line}`);
    io.stderr('Попередній вміст каталогу матеріалів не змінено.');
    return 1;
  }
}

if (import.meta.main) {
  process.exitCode = await runDownloads(process.argv.slice(2), {
    stdout: (line) => process.stdout.write(`${line}\n`),
    stderr: (line) => process.stderr.write(`${line}\n`),
  });
}
