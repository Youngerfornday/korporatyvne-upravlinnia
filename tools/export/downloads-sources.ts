import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parse } from 'yaml';
import { z } from 'zod';
import { CourseSchema, type Course } from '../../src/content/schemas/course.ts';
import { PracticalFileSchema, type PracticalFile } from '../../src/content/schemas/practical.ts';
import { HttpUrlSchema, IsoDateSchema } from '../../src/content/schemas/primitives.ts';

/**
 * Джерела для матеріалів: реєстр курсу, файли тренажерів практичних, дати оновлення лекцій і опис
 * резервної копії в GitHub Releases. Помилка валідації зупиняє генерацію з поясненням українською.
 */

export interface DownloadSources {
  readonly course: Course;
  /** Опубліковані практичні: файл тренажера є і пройшов валідацію. */
  readonly practicals: readonly PracticalFile[];
  readonly backup: CourseBackup;
  /** Дата збірки — найпізніша дата оновлення контенту: однаковий контент дає однакові файли. */
  readonly date: Date;
}

const CourseBackupSchema = z.object({
  tag: z.string().min(1),
  asset: z.string().regex(/\.mbz$/, 'Назва файлу резервної копії має закінчуватися на .mbz'),
  url: HttpUrlSchema,
  bytes: z.int().positive(),
  sha256: z.string().regex(/^[0-9a-f]{64}$/, 'SHA-256 — 64 шістнадцяткові символи'),
  moodle: z.string().min(1),
  builtAt: IsoDateSchema,
});

export type CourseBackup = z.infer<typeof CourseBackupSchema>;

const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---/;
const LectureDateSchema = z.object({ updatedAt: IsoDateSchema });

function issuesText(file: string, error: z.ZodError): string {
  return `${file} не проходить валідацію:\n${error.issues.map((issue) => `  - ${issue.path.join('.') || '(корінь)'}: ${issue.message}`).join('\n')}`;
}

async function parseDataFile<T>(file: string, schema: z.ZodType<T>): Promise<T> {
  const raw: unknown = file.endsWith('.json') ? JSON.parse(await readFile(file, 'utf8')) : parse(await readFile(file, 'utf8'));
  const result = schema.safeParse(raw);
  if (!result.success) throw new Error(issuesText(file, result.error));
  return result.data;
}

async function listNames(dir: string, pattern: RegExp): Promise<string[]> {
  const names = await readdir(dir).catch(() => [] as string[]);
  return names.filter((name) => pattern.test(name)).sort();
}

async function loadPracticals(dir: string, course: Course): Promise<PracticalFile[]> {
  const files = await listNames(dir, /^p\d{2}\.ya?ml$/);
  const practicals = await Promise.all(files.map((name) => parseDataFile(join(dir, name), PracticalFileSchema)));
  const unknown = practicals.filter((file) => !course.practicals.some((practical) => practical.id === file.id));
  if (unknown.length > 0) throw new Error(`Практичних ${unknown.map((file) => file.id).join(', ')} немає в реєстрі course.yaml`);
  return practicals;
}

async function lectureDates(modulesDir: string): Promise<string[]> {
  const modules = await listNames(modulesDir, /^m[1-9]\d*$/);
  const topicDirs = (await Promise.all(modules.map(async (module) => (await listNames(join(modulesDir, module), /^t\d{2}$/)).map((topic) => join(modulesDir, module, topic))))).flat();
  const dates = await Promise.all(
    topicDirs.map(async (dir) => {
      const file = join(dir, 'lecture.mdx');
      const source = await readFile(file, 'utf8').catch(() => null);
      const frontmatter = source === null ? null : FRONTMATTER.exec(source)?.[1];
      if (source === null) return null;
      if (frontmatter === undefined || frontmatter === null) throw new Error(`${file}: немає frontmatter`);
      const result = LectureDateSchema.safeParse(parse(frontmatter));
      if (!result.success) throw new Error(issuesText(file, result.error));
      return result.data.updatedAt;
    }),
  );
  return dates.filter((date): date is string => date !== null);
}

export function latestDate(dates: readonly string[]): Date {
  const latest = [...dates].sort().at(-1);
  if (latest === undefined) throw new Error('Немає жодної дати оновлення контенту для дати збірки');
  return new Date(`${latest}T00:00:00.000Z`);
}

export async function loadDownloadSources(root: string): Promise<DownloadSources> {
  const course = await parseDataFile(join(root, 'content/course.yaml'), CourseSchema);
  const practicals = await loadPracticals(join(root, 'content/practicals'), course);
  const backup = await parseDataFile(join(root, 'tools/export/course-backup.json'), CourseBackupSchema);
  const dates = [...(await lectureDates(join(root, 'content/modules'))), ...practicals.map((file) => file.updatedAt), backup.builtAt];
  return { course, practicals, backup, date: latestDate(dates) };
}
