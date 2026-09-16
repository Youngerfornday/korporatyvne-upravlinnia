import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parse } from 'yaml';
import type { z } from 'zod';
import { CourseSchema, type Course } from '../../src/content/schemas/course.ts';
import { GlossaryFileSchema, type GlossaryFile } from '../../src/content/schemas/glossary.ts';
import { BankFileSchema, type BankFile } from '../../src/content/schemas/questions.ts';
import { findGlossaryProblems } from './glossary-xml.ts';
import { findBankProblems } from './moodle-xml.ts';

/** Читання й валідація джерел експорту тими самими zod-схемами, що й під час збірки сайту. */

export interface ContentIssue {
  readonly file: string;
  readonly message: string;
}

export interface LoadedFile<T> {
  readonly file: string;
  readonly data: T;
}

export interface ExportSources {
  readonly courseFile: string;
  readonly banksDir: string;
  readonly modulesDir: string;
}

export interface ExportContent {
  readonly course: Course;
  readonly banks: ReadonlyArray<LoadedFile<BankFile>>;
  readonly glossaries: ReadonlyArray<LoadedFile<GlossaryFile>>;
}

export interface LoadResult {
  readonly content: ExportContent | null;
  readonly issues: readonly ContentIssue[];
}

type Parsed<T> = { readonly data: T; readonly issues: readonly [] } | { readonly data: null; readonly issues: ContentIssue[] };

const YAML_FILE = /\.ya?ml$/;
const MODULE_DIR = /^m[1-9]\d*$/;
const TOPIC_DIR = /^t\d{2}$/;
const TRAINING_DIR = /(?:^|[\\/])banks[\\/]training[\\/]/;

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function parseFile<T>(file: string, schema: z.ZodType<T>): Promise<Parsed<T>> {
  let raw: unknown;
  try {
    raw = parse(await readFile(file, 'utf8'));
  } catch (error) {
    return { data: null, issues: [{ file, message: `файл не прочитано або YAML некоректний: ${errorMessage(error)}` }] };
  }
  const result = schema.safeParse(raw);
  if (result.success) return { data: result.data, issues: [] };
  return {
    data: null,
    issues: result.error.issues.map((issue) => ({
      file,
      message: issue.path.length > 0 ? `${issue.path.join('.')}: ${issue.message}` : issue.message,
    })),
  };
}

async function listDirectory(dir: string): Promise<string[] | null> {
  try {
    return (await readdir(dir)).sort();
  } catch {
    return null;
  }
}

async function listGlossaryFiles(modulesDir: string): Promise<string[]> {
  const modules = ((await listDirectory(modulesDir)) ?? []).filter((name) => MODULE_DIR.test(name));
  const perModule = await Promise.all(
    modules.map(async (module) => {
      const topics = ((await listDirectory(join(modulesDir, module))) ?? []).filter((name) => TOPIC_DIR.test(name));
      const files = await Promise.all(
        topics.map(async (topic) => ((await listDirectory(join(modulesDir, module, topic))) ?? []).includes('glossary.yaml')),
      );
      return topics.filter((_, index) => files[index]).map((topic) => join(modulesDir, module, topic, 'glossary.yaml'));
    }),
  );
  return perModule.flat();
}

async function parseAll<T>(files: readonly string[], schema: z.ZodType<T>): Promise<{ loaded: LoadedFile<T>[]; issues: ContentIssue[] }> {
  const parsed = await Promise.all(files.map((file) => parseFile(file, schema)));
  return {
    loaded: parsed.flatMap((result, index) => (result.data === null ? [] : [{ file: files[index] as string, data: result.data }])),
    issues: parsed.flatMap((result) => result.issues),
  };
}

export async function loadExportContent(sources: ExportSources): Promise<LoadResult> {
  const bankNames = await listDirectory(sources.banksDir);
  const missingDirs = [
    ...(bankNames === null ? [{ file: sources.banksDir, message: 'каталог банків питань не знайдено' }] : []),
    ...((await listDirectory(sources.modulesDir)) === null ? [{ file: sources.modulesDir, message: 'каталог модулів не знайдено' }] : []),
  ];
  const course = await parseFile(sources.courseFile, CourseSchema);
  const banks = await parseAll(
    (bankNames ?? []).filter((name) => YAML_FILE.test(name)).map((name) => join(sources.banksDir, name)),
    BankFileSchema,
  );
  const glossaries = await parseAll(await listGlossaryFiles(sources.modulesDir), GlossaryFileSchema);
  const issues = [...missingDirs, ...course.issues, ...banks.issues, ...glossaries.issues];
  const content = course.data === null ? null : { course: course.data, banks: banks.loaded, glossaries: glossaries.loaded };
  return { content, issues };
}

/** Проблеми, через які Moodle відхилив би або спотворив імпорт: реєстр тем, дублікати між файлами, seeAlso. */
export function findContentProblems(content: ExportContent): ContentIssue[] {
  const { course } = content;
  const bankIssues = (['training', 'control'] as const).flatMap((kind) => {
    const banks = content.banks.filter((bank) => bank.data.kind === kind);
    if (banks.length === 0) return [];
    const perFile = banks.flatMap(({ file, data }) => findBankProblems([data], course).map((message) => ({ file, message })));
    const reported = new Set(perFile.map((issue) => issue.message));
    const shared = findBankProblems(banks.map((bank) => bank.data), course)
      .filter((message) => !reported.has(message))
      .map((message) => ({ file: `банки (${kind})`, message }));
    return [...perFile, ...shared];
  });
  const misplaced = content.banks
    .filter(({ file, data }) => data.kind === 'control' && TRAINING_DIR.test(file))
    .map(({ file }) => ({ file, message: 'контрольний банк лежить у каталозі тренувальних банків' }));
  const all = content.glossaries.map((glossary) => glossary.data);
  const perGlossary = content.glossaries.flatMap(({ file, data }) =>
    findGlossaryProblems([data], course, all).map((message) => ({ file, message })),
  );
  const reported = new Set(perGlossary.map((issue) => issue.message));
  const sharedGlossary = findGlossaryProblems(all, course)
    .filter((message) => !reported.has(message))
    .map((message) => ({ file: 'глосарії', message }));
  return [...misplaced, ...bankIssues, ...perGlossary, ...sharedGlossary];
}
