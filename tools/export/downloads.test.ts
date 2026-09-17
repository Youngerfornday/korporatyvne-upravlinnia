import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import type { DownloadManifest } from '../../src/content/schemas/downloads.ts';
import { astroBuild, generateDownloads, runDownloads, type DownloadsDeps } from './downloads.ts';
import { checkDownloadsDir } from './downloads-verify.ts';
import type { PrintJob, PrintOptions } from './pdf.ts';
import { loadCourse } from './test-support/docx-xml.ts';
import { readZip, readZipText } from './unzip.ts';

/**
 * Оркестратор на реальному content/ з підробленими збіркою сайту й друком PDF: справжні експортери
 * Moodle XML, Книг і DOCX, пакети, маніфест за схемою, відтворюваність і поведінка при падінні кроку.
 */

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const FAKE_PDF = "%PDF-1.4\n<< /Type /Pages /Count 2 >>\n<< /CreationDate (D:20260916000000+00'00') >>\n";

const printed: Array<{ jobs: readonly PrintJob[]; options: PrintOptions }> = [];

async function fakeSite(root: string, outDir: string): Promise<void> {
  const course = await loadCourse();
  expect(root).toBe(ROOT);
  await Promise.all(
    course.topics.map(async (topic, index) => {
      const file = join(outDir, 'temy', topic.slug, 'index.html');
      const article = index === 0 ? `<article class="read" data-topic-article><p>Вступ до теми.</p><h2>Агентська проблема</h2><p>Текст глави.</p></article>` : '<div data-topic-pending>Тема готується</div>';
      await mkdir(dirname(file), { recursive: true });
      await writeFile(file, `<!DOCTYPE html><html lang="uk"><head><title>${topic.title}</title><link rel="stylesheet" href="/korporatyvne-upravlinnia/_astro/topic.css"></head><body><main>${article}</main></body></html>`);
    }),
  );
}

const fakeDeps: DownloadsDeps = {
  buildSite: fakeSite,
  printPdfs: async (jobs, options) => {
    printed.push({ jobs, options });
    return Promise.all(
      jobs.map(async (job) => {
        await mkdir(dirname(job.outFile), { recursive: true });
        await writeFile(job.outFile, FAKE_PDF, 'latin1');
        return { outFile: job.outFile, bytes: Buffer.byteLength(FAKE_PDF, 'latin1'), pages: 2 };
      }),
    );
  },
};

const silent = { stdout: () => undefined, stderr: () => undefined };

async function filesOf(dir: string): Promise<Map<string, Buffer>> {
  const entries = await readdir(dir, { recursive: true, withFileTypes: true });
  const files = entries.filter((entry) => entry.isFile()).map((entry) => join(entry.parentPath, entry.name));
  return new Map(await Promise.all(files.map(async (file) => [file.slice(dir.length + 1), await readFile(file)] as const)));
}

let workspace: string;
let outDir: string;
let manifest: DownloadManifest;

beforeAll(async () => {
  workspace = await mkdtemp(join(tmpdir(), 'ku-downloads-test-'));
  outDir = join(workspace, 'first', 'downloads');
  manifest = await generateDownloads({ root: ROOT, outDir, distDir: undefined }, silent, fakeDeps);
}, 120_000);

afterAll(async () => {
  await rm(workspace, { recursive: true, force: true });
});

describe('генерація матеріалів', () => {
  test('маніфест за схемою: усі файли існують, розміри збігаються, зайвих файлів немає', async () => {
    const check = await checkDownloadsDir(outDir);
    expect(check.issues).toEqual([]);
    expect(check.manifest).toEqual(manifest);
    expect(manifest.schemaVersion).toBe(1);
    expect(manifest.generatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T00:00:00\.000Z$/);
  });

  test('склад: силабус і РП, лекції опублікованих тем, практичні з тренажером, XML, Книги, пакети й резервна копія', async () => {
    const ids = manifest.items.map((item) => item.id);
    const practicals = (await readdir(join(ROOT, 'content/practicals'))).filter((name) => /^p\d{2}\.yaml$/.test(name)).map((name) => `practical-${name.slice(0, 3)}`);
    const banks = (await readdir(join(ROOT, 'content/banks/training'))).filter((name) => /^m\d+\.yaml$/.test(name)).map((name) => `questions-training-${name.replace('.yaml', '')}`);
    expect(ids.slice(0, 2)).toEqual(['syllabus', 'work-program']);
    expect(ids.slice(-4)).toEqual(['questions-training-course', 'glossary-course', 'bundle-course', 'backup-course']);
    expect(ids.filter((id) => id.startsWith('lecture-'))).toEqual(['lecture-t01']);
    expect(ids.filter((id) => id.startsWith('book-'))).toEqual(['book-t01']);
    expect(ids.filter((id) => id.startsWith('practical-')).sort()).toEqual(practicals.sort());
    expect(ids).toEqual(expect.arrayContaining([...banks, 'glossary-m1', 'bundle-m1']));
    for (const item of manifest.items.filter((candidate) => candidate.kind === 'bundle' && candidate.module !== undefined)) {
      const last = ids.findLastIndex((id) => manifest.items.find((candidate) => candidate.id === id)?.module === item.module);
      expect(ids[last]).toBe(item.id);
    }
    const byId = new Map(manifest.items.map((item) => [item.id, item]));
    expect(byId.get('lecture-t01')).toMatchObject({ kind: 'lecture', format: 'pdf', audience: 'student', module: 'm1', topic: 't01', path: 'downloads/m1/lecture-t01.pdf' });
    expect(byId.get('practical-p01')).toMatchObject({ kind: 'practical', practical: 'p01', path: 'downloads/m1/practical-p01.pdf' });
    expect(byId.get('work-program')).toMatchObject({ kind: 'work-program', format: 'docx', audience: 'teacher', path: 'downloads/course/work-program.docx' });
    expect(byId.get('questions-training-m1')).toMatchObject({ kind: 'question-bank', format: 'xml', path: 'downloads/moodle/questions-training-m1.xml' });
    expect(byId.get('book-t01')).toMatchObject({ kind: 'book', format: 'zip', path: 'downloads/moodle/book-t01.zip' });
    const backup = JSON.parse(await readFile(join(ROOT, 'tools/export/course-backup.json'), 'utf8')) as { url: string; bytes: number };
    expect(byId.get('backup-course')).toMatchObject({ kind: 'backup', format: 'mbz', url: backup.url, bytes: backup.bytes });
    expect(byId.get('backup-course')?.path).toBeUndefined();
    expect(ids.some((id) => id.includes('control'))).toBe(false);
  });

  test('друк: лише опубліковані теми й практичні, сторінка практичної — зі стилями сайту', () => {
    const run = printed[0];
    const pages = run?.jobs.map((job) => job.page) ?? [];
    expect(pages[0]).toBe('temy/korporatsiia-i-korporatyvne-upravlinnia/');
    expect(pages.filter((page) => page.startsWith('temy/'))).toHaveLength(1);
    expect(pages).toContain('pdf/praktychni/p01/');
    expect(run?.options.basePath).toBe('/korporatyvne-upravlinnia/');
    expect(run?.options.footerText).toBe('Корпоративне управління · НУ «Чернігівська політехніка»');
    const practical = run?.options.extraPages?.get('pdf/praktychni/p01/') ?? '';
    expect(practical).toContain('/korporatyvne-upravlinnia/_astro/topic.css');
    expect(practical).toContain('Рубрика оцінювання');
  });

  test('пакет модуля: коренева тека, README зі змістом і джерелом, файли модуля без документів курсу', async () => {
    const zip = await readFile(join(outDir, 'm1/korporatyvne-upravlinnia-m1.zip'));
    const paths = readZip(zip).map((entry) => entry.path);
    const members = manifest.items.filter((item) => item.module === 'm1' && item.kind !== 'bundle').map((item) => `korporatyvne-upravlinnia-m1/${item.path?.slice('downloads/'.length)}`);
    expect(paths).toEqual(['korporatyvne-upravlinnia-m1/README.txt', ...members]);
    expect(paths).toEqual(expect.arrayContaining(['korporatyvne-upravlinnia-m1/m1/lecture-t01.pdf', 'korporatyvne-upravlinnia-m1/moodle/glossary-m1.xml']));
    const readme = readZipText(zip, 'korporatyvne-upravlinnia-m1/README.txt');
    expect(readme).toContain('Корпоративне управління — Модуль 1 — усі матеріали');
    expect(readme).toContain('m1/lecture-t01.pdf');
    expect(readme).toContain('Сайт курсу: https://youngerfornday.github.io/korporatyvne-upravlinnia/');
    expect(readme).toContain('Репозиторій: https://github.com/Youngerfornday/korporatyvne-upravlinnia');
    expect(readme).toContain('releases/download/course-backup-2026-09/korporatyvne-upravlinnia.mbz');
    expect(readme).toContain('Контрольні тести');
    expect(readZipText(zip, 'korporatyvne-upravlinnia-m1/m1/lecture-t01.pdf')).toBe(FAKE_PDF);
  });

  test('пакет курсу містить документи DOCX і всі файли модулів, але не інші пакети', async () => {
    const paths = readZip(await readFile(join(outDir, 'course/korporatyvne-upravlinnia.zip'))).map((entry) => entry.path.replace(/^korporatyvne-upravlinnia\//, ''));
    expect(paths).toContain('course/syllabus.docx');
    expect(paths).toContain('course/work-program.docx');
    expect(paths).toContain('moodle/questions-training-course.xml');
    expect(paths.some((path) => path.endsWith('.zip') && path.includes('korporatyvne-upravlinnia'))).toBe(false);
  });

  test('повторний запуск дає ті самі байти в кожному файлі', async () => {
    const second = join(workspace, 'second', 'downloads');
    await generateDownloads({ root: ROOT, outDir: second, distDir: undefined }, silent, fakeDeps);
    const [a, b] = await Promise.all([filesOf(outDir), filesOf(second)]);
    expect([...b.keys()].sort()).toEqual([...a.keys()].sort());
    for (const [file, data] of a) expect(b.get(file)?.equals(data), file).toBe(true);
  }, 120_000);
});

describe('помилки й аргументи', () => {
  test('падіння кроку: код 1, український звіт з назвою кроку, попередній вміст не змінено', async () => {
    const target = join(workspace, 'failing');
    await mkdir(target, { recursive: true });
    await writeFile(join(target, 'keep.txt'), 'старий вміст');
    const errors: string[] = [];
    const failing: DownloadsDeps = { ...fakeDeps, printPdfs: () => Promise.reject(new Error('Chromium не запустився')) };
    const code = await runDownloads(['--out', target], { stdout: () => undefined, stderr: (line) => errors.push(line) }, ROOT, failing);
    expect(code).toBe(1);
    expect(errors).toContain('Матеріали для вивантаження не згенеровано: крок «PDF лекцій і практичних (Playwright)» завершився помилкою.');
    expect(errors).toContain('  Chromium не запустився');
    expect(await readFile(join(target, 'keep.txt'), 'utf8')).toBe('старий вміст');
  }, 120_000);

  test('без реєстру курсу генерація зупиняється на першому кроці', async () => {
    const empty = await mkdtemp(join(tmpdir(), 'ku-downloads-empty-'));
    try {
      await expect(generateDownloads({ root: empty, outDir: join(empty, 'out'), distDir: join(empty, 'site') }, silent, fakeDeps)).rejects.toMatchObject({
        step: 'Реєстр курсу, практичні й резервна копія',
      });
      expect(existsSync(join(empty, 'out'))).toBe(false);
    } finally {
      await rm(empty, { recursive: true, force: true });
    }
  });

  test('невідомий аргумент — код 2 з підказкою; --help — код 0; успіх друкує підсумок', async () => {
    const lines: string[] = [];
    const io = { stdout: (line: string) => lines.push(line), stderr: (line: string) => lines.push(line) };
    expect(await runDownloads(['--nope'], io, ROOT, fakeDeps)).toBe(2);
    expect(lines.at(-1)).toContain('Використання: npm run build:downloads');
    expect(await runDownloads(['--help'], io, ROOT, fakeDeps)).toBe(0);
    const out = join(workspace, 'cli');
    expect(await runDownloads(['--out', out], io, ROOT, fakeDeps)).toBe(0);
    expect(lines.some((line) => new RegExp(`^Матеріали готові: ${manifest.items.length} матеріал\\S* у маніфесті\\.$`).test(line))).toBe(true);
  }, 120_000);

  test('помилка astro build повертає хвіст виводу', async () => {
    const empty = await mkdtemp(join(tmpdir(), 'ku-astro-'));
    try {
      await expect(astroBuild(empty, join(empty, 'site'))).rejects.toThrow('astro build завершився з помилкою');
    } finally {
      await rm(empty, { recursive: true, force: true });
    }
  });
});
