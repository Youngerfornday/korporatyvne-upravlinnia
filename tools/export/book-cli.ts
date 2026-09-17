import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { parse } from 'yaml';
import { CourseSchema, type Course } from '../../src/content/schemas/course.ts';
import { buildBookZip, type BookPlan } from './book-zip.ts';
import { readSiteUrl } from './site-url.ts';

/**
 * npm run export:book — ZIP глав Книги на кожну опубліковану тему зі зібраного сайту.
 *   --dist <каталог>     зібраний сайт (типово dist)
 *   --course <файл>      реєстр курсу (типово content/course.yaml)
 *   --out <каталог>      куди писати архіви (типово dist-export/moodle/books)
 *   --site <URL>         адреса живого сайту (типово з astro.config.mjs)
 * Тема без сторінки або без статті (ще не написана лекція) пропускається з поясненням, а не ламає збірку.
 * Код 0 — принаймні спроба виконана; 1 — не прочитано реєстр курсу; 2 — неправильні аргументи.
 */

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const USAGE =
  'Використання: node --import ./tools/export/register-ts.mjs tools/export/book-cli.ts [--dist <каталог>] [--course <файл>] [--out <каталог>] [--site <URL>]';
export const BOOKS_MANIFEST = 'books.json';

export interface BookManifestEntry {
  readonly topic: string;
  readonly module: string;
  readonly slug: string;
  readonly title: string;
  readonly file: string;
  readonly chapters: readonly string[];
  readonly images: readonly string[];
  readonly warnings: readonly string[];
}

export interface BooksManifest {
  readonly schemaVersion: 1;
  readonly generator: string;
  readonly site: string;
  readonly books: readonly BookManifestEntry[];
  readonly skipped: ReadonlyArray<{ readonly topic: string; readonly reason: string }>;
}

interface CliOptions {
  readonly distDir: string;
  readonly courseFile: string;
  readonly outDir: string;
  readonly site: string | undefined;
}

function parseOptions(argv: readonly string[], cwd: string): CliOptions | 'help' {
  const { values } = parseArgs({
    args: [...argv],
    options: {
      dist: { type: 'string' },
      course: { type: 'string' },
      out: { type: 'string' },
      site: { type: 'string' },
      help: { type: 'boolean', short: 'h' },
    },
    strict: true,
    allowPositionals: false,
  });
  if (values.help) return 'help';
  const path = (value: string | undefined, fallback: string): string =>
    value === undefined ? join(ROOT, fallback) : resolve(cwd, value);
  return {
    distDir: path(values.dist, 'dist'),
    courseFile: path(values.course, 'content/course.yaml'),
    outDir: path(values.out, 'dist-export/moodle/books'),
    site: values.site,
  };
}

function entry(topic: Course['topics'][number], plan: BookPlan, file: string): BookManifestEntry {
  return {
    topic: topic.id,
    module: topic.module,
    slug: topic.slug,
    title: topic.title,
    file,
    chapters: plan.chapters.map((chapter) => chapter.title),
    images: plan.images.map((image) => image.path),
    warnings: plan.warnings,
  };
}

async function loadCourse(file: string): Promise<Course> {
  const parsed = CourseSchema.safeParse(parse(await readFile(file, 'utf8')));
  if (!parsed.success) {
    throw new Error(`Реєстр курсу ${file} не проходить валідацію:\n${parsed.error.issues.map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`).join('\n')}`);
  }
  return parsed.data;
}

export async function runBookCli(
  argv: readonly string[],
  io: { stdout: (line: string) => void; stderr: (line: string) => void } = {
    stdout: (line) => process.stdout.write(`${line}\n`),
    stderr: (line) => process.stderr.write(`${line}\n`),
  },
  cwd: string = process.cwd(),
): Promise<number> {
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

  let course: Course;
  try {
    course = await loadCourse(options.courseFile);
  } catch (error) {
    io.stderr(error instanceof Error ? error.message : String(error));
    return 1;
  }
  const site = options.site ?? (await readSiteUrl(join(ROOT, 'astro.config.mjs')));

  await rm(options.outDir, { recursive: true, force: true });
  await mkdir(options.outDir, { recursive: true });

  const books: BookManifestEntry[] = [];
  const skipped: Array<{ topic: string; reason: string }> = [];
  for (const topic of course.topics) {
    const page = join(options.distDir, 'temy', topic.slug, 'index.html');
    const html = await readFile(page, 'utf8').catch(() => null);
    if (html === null) {
      skipped.push({ topic: topic.id, reason: `немає сторінки ${relative(ROOT, page)} — зберіть сайт (npm run build)` });
      continue;
    }
    try {
      const { plan, zip } = buildBookZip(html, { siteUrl: site });
      const file = `${topic.id}.zip`;
      await writeFile(join(options.outDir, file), zip);
      books.push(entry(topic, plan, file));
    } catch (error) {
      skipped.push({ topic: topic.id, reason: error instanceof Error ? error.message : String(error) });
    }
  }

  const manifest: BooksManifest = { schemaVersion: 1, generator: 'tools/export/book-cli.ts', site, books, skipped };
  await writeFile(join(options.outDir, BOOKS_MANIFEST), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');

  io.stdout(`Книги Moodle: ${books.length} з ${course.topics.length} тем у ${relative(cwd, options.outDir)}`);
  for (const book of books) io.stdout(`  ${book.file}: ${book.title} — глав ${book.chapters.length}, схем ${book.images.length}`);
  for (const miss of skipped) io.stdout(`  пропущено ${miss.topic}: ${miss.reason}`);
  for (const book of books) for (const warning of book.warnings) io.stderr(`  увага, ${book.topic}: ${warning}`);
  return 0;
}

if (import.meta.main) {
  process.exitCode = await runBookCli(process.argv.slice(2));
}
