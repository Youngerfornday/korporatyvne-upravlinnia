import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type { DownloadItem } from '../../src/content/schemas/downloads.ts';
import { runBookCli, type BooksManifest } from './book-cli.ts';
import { runCli } from './cli.ts';
import { buildSyllabus } from './docx/syllabus.ts';
import { buildWorkProgram } from './docx/work-program.ts';
import { packDocx } from './docx/pack.ts';
import { bundleMembers, memberPath, readmeText } from './downloads-bundle.ts';
import {
  COURSE_BUNDLE_TITLE,
  backupItem,
  bookItem,
  courseBundleItem,
  glossaryItem,
  lectureItem,
  moduleBundleItem,
  moduleBundleTitle,
  orderItems,
  practicalItem,
  questionBankItem,
  syllabusItem,
  workProgramItem,
  type XmlScope,
} from './downloads-items.ts';
import type { DownloadSources } from './downloads-sources.ts';
import type { ExportManifest } from './export-files.ts';
import type { PrintJob, PrintOptions, PrintedPdf } from './pdf.ts';
import { extractHead, renderPracticalPage } from './practical-page.ts';
import { createZip } from './zip.ts';

/**
 * Кроки генерації матеріалів. Кожен пише у свій підкаталог staging (`<тимчасовий>/downloads`) і повертає
 * елементи маніфесту; наявні експортери Moodle XML і Книг лише викликаються.
 */

export interface StepContext {
  readonly root: string;
  readonly sources: DownloadSources;
  readonly siteDir: string;
  readonly siteUrl: string;
  readonly workDir: string;
  readonly stagingDir: string;
  readonly warn: (line: string) => void;
}

export type PrintPdfs = (jobs: readonly PrintJob[], options: PrintOptions) => Promise<PrintedPdf[]>;

/** Сторінка теми з опублікованою лекцією містить статтю `data-topic-article`. */
const ARTICLE_MARKER = 'data-topic-article';
const PRACTICAL_PAGE_PREFIX = 'pdf/praktychni';

async function writeStaged(ctx: StepContext, file: string, data: Uint8Array): Promise<{ file: string; bytes: number }> {
  const target = join(ctx.stagingDir, file);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, data);
  return { file, bytes: data.length };
}

async function captured(run: (io: { stdout: (line: string) => void; stderr: (line: string) => void }) => Promise<number>): Promise<{ code: number; output: string[] }> {
  const output: string[] = [];
  const code = await run({ stdout: (line) => output.push(line), stderr: (line) => output.push(line) });
  return { code, output };
}

function xmlScope(scope: string): XmlScope {
  if (scope === 'course') return { kind: 'course' };
  if (scope === 'final') return { kind: 'final' };
  return { kind: 'module', module: scope };
}

/** Moodle XML тренувальних питань і глосарію — наявним CLI експорту, у `downloads/moodle/`. */
export async function moodleXmlStep(ctx: StepContext): Promise<DownloadItem[]> {
  const { course } = ctx.sources;
  const outDir = join(ctx.workDir, 'moodle-xml');
  const args = ['--banks', join(ctx.root, 'content/banks/training'), '--modules', join(ctx.root, 'content/modules'), '--course', join(ctx.root, 'content/course.yaml'), '--out', outDir];
  const { code, output } = await captured((io) => runCli(args, io, ctx.root));
  if (code !== 0) throw new Error(output.join('\n'));
  const manifest = JSON.parse(await readFile(join(outDir, 'manifest.json'), 'utf8')) as ExportManifest;
  const control = manifest.questions.filter((entry) => entry.kind !== 'training');
  if (control.length > 0) throw new Error(`серед тренувальних банків знайдено контрольні питання (${control.map((entry) => entry.file).join(', ')}) — на сайт їх публікувати не можна`);
  const copy = async (file: string): Promise<{ file: string; bytes: number }> => {
    const data = await readFile(join(outDir, file));
    return writeStaged(ctx, `moodle/${file}`, data);
  };
  const questions = await Promise.all(manifest.questions.map(async (entry) => questionBankItem(course, xmlScope(entry.scope), await copy(entry.file), entry.total)));
  const glossaries = await Promise.all(manifest.glossaries.map(async (entry) => glossaryItem(course, xmlScope(entry.scope), await copy(entry.file), entry.total)));
  return [...questions, ...glossaries];
}

/** ZIP глав Книги на кожну опубліковану тему — наявним книжковим експортером. */
export async function booksStep(ctx: StepContext): Promise<DownloadItem[]> {
  const { course } = ctx.sources;
  const outDir = join(ctx.workDir, 'books');
  const args = ['--dist', ctx.siteDir, '--course', join(ctx.root, 'content/course.yaml'), '--out', outDir, '--site', ctx.siteUrl];
  const { code, output } = await captured((io) => runBookCli(args, io, ctx.root));
  if (code !== 0) throw new Error(output.join('\n'));
  const manifest = JSON.parse(await readFile(join(outDir, 'books.json'), 'utf8')) as BooksManifest;
  for (const book of manifest.books) for (const warning of book.warnings) ctx.warn(`Книга ${book.topic}: ${warning}`);
  return Promise.all(
    manifest.books.map(async (book) => {
      const topic = course.topics.find((candidate) => candidate.id === book.topic);
      if (!topic) throw new Error(`книжковий експортер повернув невідому тему ${book.topic}`);
      const staged = await writeStaged(ctx, `moodle/book-${topic.id}.zip`, await readFile(join(outDir, book.file)));
      return bookItem(course, topic, staged, book.chapters.length, book.images.length);
    }),
  );
}

/** PDF лекцій опублікованих тем і умов опублікованих практичних. */
export async function pdfStep(ctx: StepContext, print: PrintPdfs): Promise<DownloadItem[]> {
  const { course, practicals, date } = ctx.sources;
  const topicPages = await Promise.all(
    course.topics.map(async (topic) => ({ topic, html: await readFile(join(ctx.siteDir, 'temy', topic.slug, 'index.html'), 'utf8').catch(() => null) })),
  );
  const missing = topicPages.filter((page) => page.html === null).map((page) => page.topic.slug);
  if (missing.length > 0) throw new Error(`у зібраному сайті немає сторінок тем: ${missing.join(', ')}`);
  const published = topicPages.filter((page) => page.html?.includes(ARTICLE_MARKER) === true).map((page) => page.topic);
  const head = extractHead(topicPages[0]?.html ?? '');

  const practicalJobs = practicals.map((file) => {
    const practical = course.practicals.find((candidate) => candidate.id === file.id);
    if (!practical) throw new Error(`практичної ${file.id} немає в реєстрі курсу`);
    return { practical, page: `${PRACTICAL_PAGE_PREFIX}/${practical.id}/`, html: renderPracticalPage({ course, practical, file, head }) };
  });
  const lectureFile = (topic: (typeof published)[number]): string => `${topic.module}/lecture-${topic.id}.pdf`;
  const practicalFile = (practical: (typeof practicalJobs)[number]['practical']): string => `${practical.module}/practical-${practical.id}.pdf`;
  const jobs: PrintJob[] = [
    ...published.map((topic) => ({ page: `temy/${topic.slug}/`, outFile: join(ctx.stagingDir, lectureFile(topic)) })),
    ...practicalJobs.map((job) => ({ page: job.page, outFile: join(ctx.stagingDir, practicalFile(job.practical)) })),
  ];
  const printed = await print(jobs, {
    siteDir: ctx.siteDir,
    basePath: new URL(ctx.siteUrl).pathname,
    footerText: `${course.title} · ${course.institutionShort}`,
    date,
    extraPages: new Map(practicalJobs.map((job) => [job.page, job.html])),
  });
  const result = (file: string): PrintedPdf => {
    const found = printed.find((pdf) => pdf.outFile === join(ctx.stagingDir, file));
    if (!found) throw new Error(`PDF ${file} не надруковано`);
    return found;
  };
  return [
    ...published.map((topic) => {
      const pdf = result(lectureFile(topic));
      return lectureItem(course, topic, { file: lectureFile(topic), bytes: pdf.bytes }, pdf.pages);
    }),
    ...practicalJobs.map(({ practical }) => {
      const pdf = result(practicalFile(practical));
      return practicalItem(course, practical, { file: practicalFile(practical), bytes: pdf.bytes }, pdf.pages);
    }),
  ];
}

/** Силабус і робоча програма DOCX з course.yaml. */
export async function docxStep(ctx: StepContext): Promise<DownloadItem[]> {
  const { course, date } = ctx.sources;
  const options = { siteUrl: ctx.siteUrl, date };
  const syllabus = await writeStaged(ctx, 'course/syllabus.docx', await packDocx(buildSyllabus(course, options), date));
  const program = await writeStaged(ctx, 'course/work-program.docx', await packDocx(buildWorkProgram(course, options), date));
  return [syllabusItem(course, syllabus), workProgramItem(course, program)];
}

async function writeBundle(
  ctx: StepContext,
  file: string,
  title: string,
  members: readonly DownloadItem[],
  backup: DownloadItem,
): Promise<{ file: string; bytes: number }> {
  const folder = file.slice(file.lastIndexOf('/') + 1).replace(/\.zip$/, '');
  const readme = readmeText({ course: ctx.sources.course, title, members, siteUrl: ctx.siteUrl, generatedAt: ctx.sources.date, backup });
  const entries = [
    { path: `${folder}/README.txt`, data: Buffer.from(readme, 'utf8') },
    ...(await Promise.all(members.map(async (item) => ({ path: `${folder}/${memberPath(item)}`, data: await readFile(join(ctx.stagingDir, memberPath(item))) })))),
  ];
  return writeStaged(ctx, file, createZip(entries));
}

/** Пакети «Модуль N — усі матеріали» і «Курс повністю» плюс посилання на резервну копію в Releases. */
export async function bundlesStep(ctx: StepContext, items: readonly DownloadItem[]): Promise<DownloadItem[]> {
  const { course, backup } = ctx.sources;
  const backupEntry = backupItem(backup);
  const ordered = orderItems(course, items);
  const modules = course.modules.filter((module) => bundleMembers(ordered, module.id).length > 0);
  const moduleBundles = await Promise.all(
    modules.map(async (module) => {
      const file = `${module.id}/korporatyvne-upravlinnia-${module.id}.zip`;
      const staged = await writeBundle(ctx, file, moduleBundleTitle(course, module.id), bundleMembers(ordered, module.id), backupEntry);
      return moduleBundleItem(course, module.id, staged);
    }),
  );
  const courseMembers = bundleMembers(ordered, undefined);
  const courseBundle =
    courseMembers.length === 0
      ? []
      : [courseBundleItem(await writeBundle(ctx, 'course/korporatyvne-upravlinnia.zip', COURSE_BUNDLE_TITLE, courseMembers, backupEntry))];
  return [...moduleBundles, ...courseBundle, backupEntry];
}
