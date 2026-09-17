import { access, mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';
import { z } from 'zod';
import { CourseSchema, type Course } from '../../../src/content/schemas/course.ts';
import { SlidesFileSchema, type SlidesFile } from '../../../src/content/schemas/slides.ts';
import { SourcesFileSchema, type SourcesFile } from '../../../src/content/schemas/sources.ts';
import { buildPresentation } from './pptx.ts';

const ROOT = fileURLToPath(new URL('../../..', import.meta.url));
const USAGE = `Використання: npm run export:slides -- --topic tNN [--out каталог] [--date РРРР-ММ-ДД]
               npm run export:slides -- --all [--out каталог] [--date РРРР-ММ-ДД]`;

interface CliOptions {
  readonly all: boolean;
  readonly topics: readonly string[];
  readonly outDir: string;
  readonly date: string | undefined;
}

type Io = { stdout: (line: string) => void; stderr: (line: string) => void };
const PROCESS_IO: Io = { stdout: (line) => process.stdout.write(`${line}\n`), stderr: (line) => process.stderr.write(`${line}\n`) };

function errorMessage(error: unknown): string {
  if (error instanceof z.ZodError) {
    return `Помилка валідації: ${error.issues.map((issue) => `${issue.path.join('.') || 'файл'} — ${issue.message}`).join('; ')}`;
  }
  return error instanceof Error ? error.message : String(error);
}

function parseOptions(argv: readonly string[], cwd: string): CliOptions | 'help' {
  const topics: string[] = [];
  let all = false;
  let outDir = resolve(cwd, 'dist-export/slides');
  let date: string | undefined;
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--help' || arg === '-h') return 'help';
    if (arg === '--all') {
      all = true;
      continue;
    }
    if (arg === '--topic') {
      const value = argv[++index];
      if (!value) throw new Error('Після --topic потрібен ідентифікатор tNN');
      topics.push(value);
      continue;
    }
    if (arg === '--out') {
      const value = argv[++index];
      if (!value) throw new Error('Після --out потрібен каталог');
      outDir = resolve(cwd, value);
      continue;
    }
    if (arg === '--date') {
      const value = argv[++index];
      if (!value) throw new Error('Після --date потрібна дата РРРР-ММ-ДД');
      date = value;
      continue;
    }
    throw new Error(`Невідомий аргумент «${arg}»`);
  }
  if (all === (topics.length > 0)) throw new Error('Вкажіть рівно один режим: --topic tNN або --all');
  for (const topic of topics) if (!/^t\d{2}$/u.test(topic)) throw new Error(`Некоректний ідентифікатор теми «${topic}», очікується tNN`);
  return { all, topics, outDir, date };
}

async function readYaml<T>(file: string): Promise<T> {
  return parse(await readFile(file, 'utf8')) as T;
}

async function exists(file: string): Promise<boolean> {
  try {
    await access(file, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function topicDirectories(course: Course, options: CliOptions): Promise<readonly { topicId: string; moduleId: string; dir: string }[]> {
  let selected = options.topics;
  if (options.all) {
    const modulesDir = join(ROOT, 'content', 'modules');
    const moduleEntries = await readdir(modulesDir, { withFileTypes: true });
    const available = new Set<string>();
    for (const moduleEntry of moduleEntries.filter((entry) => entry.isDirectory())) {
      const topicEntries = await readdir(join(modulesDir, moduleEntry.name), { withFileTypes: true });
      for (const topicEntry of topicEntries.filter((entry) => entry.isDirectory() && /^t\d{2}$/u.test(entry.name))) {
        if (await exists(join(modulesDir, moduleEntry.name, topicEntry.name, 'slides.yaml'))) available.add(topicEntry.name);
      }
    }
    selected = course.topics.map((topic) => topic.id).filter((topicId) => available.has(topicId));
    if (selected.length === 0) throw new Error('Не знайдено жодного slides.yaml для експорту');
  }
  const jobs: { topicId: string; moduleId: string; dir: string }[] = [];
  for (const topicId of selected) {
    const topic = course.topics.find((candidate) => candidate.id === topicId);
    if (!topic) throw new Error(`Тема «${topicId}» відсутня в course.yaml`);
    const dir = join(ROOT, 'content', 'modules', topic.module, topic.id);
    if (!(await exists(join(dir, 'slides.yaml')))) throw new Error(`Для теми «${topicId}» немає slides.yaml`);
    jobs.push({ topicId, moduleId: topic.module, dir });
  }
  return jobs;
}

async function validateCrossReferencesAsync(file: SlidesFile, sourceFile: SourcesFile, course: Course, dir: string): Promise<void> {
  const sourceIds = new Set(sourceFile.sources.map((source) => source.id));
  for (const slide of file.slides) {
    for (const sourceId of slide.sources) if (!sourceIds.has(sourceId)) throw new Error(`Слайд «${slide.id}»: джерела «${sourceId}» немає в sources.yaml`);
    if (slide.type === 'case' && !course.cases.some((candidate) => candidate.id === slide.case)) throw new Error(`Слайд «${slide.id}»: кейс «${slide.case}» не зареєстровано в course.yaml`);
    if (slide.type === 'figure' && !(await exists(join(dir, slide.figure)))) throw new Error(`Слайд «${slide.id}»: немає файлу схеми ${slide.figure}`);
  }
}

function slugFor(course: Course, topicId: string): string {
  const topic = course.topics.find((candidate) => candidate.id === topicId);
  if (!topic) throw new Error(`Тема «${topicId}» відсутня в course.yaml`);
  return topic.slug;
}

export async function runSlidesCli(argv: readonly string[], io: Io = PROCESS_IO, cwd: string = process.cwd()): Promise<number> {
  let options: CliOptions | 'help';
  try {
    options = parseOptions(argv, cwd);
  } catch (error) {
    io.stderr(errorMessage(error));
    io.stderr(USAGE);
    return 2;
  }
  if (options === 'help') {
    io.stdout(USAGE);
    return 0;
  }
  try {
    const course = CourseSchema.parse(await readYaml(join(ROOT, 'content', 'course.yaml')));
    const jobs = await topicDirectories(course, options);
    await mkdir(options.outDir, { recursive: true });
    for (const job of jobs) {
      const file = SlidesFileSchema.parse(await readYaml(join(job.dir, 'slides.yaml')));
      if (file.topic !== job.topicId) throw new Error(`slides.yaml теми «${job.topicId}» має topic «${file.topic}»`);
      const sourceFile = SourcesFileSchema.parse(await readYaml(join(job.dir, 'sources.yaml')));
      if (sourceFile.topic !== job.topicId) throw new Error(`sources.yaml теми «${job.topicId}» має topic «${sourceFile.topic}»`);
      await validateCrossReferencesAsync(file, sourceFile, course, job.dir);
      const outFile = join(options.outDir, `${job.topicId}-${slugFor(course, job.topicId)}.pptx`);
      const buffer = await buildPresentation(file, course, sourceFile, { rootDir: ROOT, topicDir: job.dir, date: options.date });
      await writeFile(outFile, buffer);
      io.stdout(`Створено ${relative(cwd, outFile) || outFile}: ${file.slides.length} слайдів`);
    }
    return 0;
  } catch (error) {
    io.stderr(`export:slides: ${errorMessage(error)}`);
    return 1;
  }
}

if (import.meta.main) process.exitCode = await runSlidesCli(process.argv.slice(2));
