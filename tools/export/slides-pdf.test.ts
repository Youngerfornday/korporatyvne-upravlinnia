import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { CourseSchema, type Course } from '../../src/content/schemas/course.ts';
import { planSlidesPdf, runSlidesPdfCli, siteFileFor, slidesPdfName } from './slides-pdf.ts';

/** PDF презентацій: планування за реєстром і slides.yaml, безпечна віддача файлів сайту, друк зібраного сайту. */

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const DIST = join(ROOT, 'dist');
const PRINT_TIMEOUT_MS = 180_000;

const course: Course = CourseSchema.parse(parse(readFileSync(join(ROOT, 'content/course.yaml'), 'utf8')));
const T01_SLUG = course.topics.find((topic) => topic.id === 't01')?.slug ?? '';
let workspace: string;

beforeAll(async () => {
  workspace = await mkdtemp(join(tmpdir(), 'ku-slides-pdf-'));
});

afterAll(async () => {
  await rm(workspace, { recursive: true, force: true });
});

function hasCommand(command: string): boolean {
  try {
    execFileSync(command, ['-v'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

describe('slidesPdfName і siteFileFor', () => {
  test('називає файл за темою і slug', () => {
    expect(slidesPdfName('t01', 'korporatsiia')).toBe('t01-korporatsiia.pdf');
  });

  test('віддає лише файли всередині каталогу сайту під base', () => {
    const base = '/kurs/';
    expect(siteFileFor('/site', base, '/kurs/temy/a/prezentatsiia/')).toBe(resolve('/site/temy/a/prezentatsiia/index.html'));
    expect(siteFileFor('/site', base, '/kurs/fonts/x.woff2')).toBe(resolve('/site/fonts/x.woff2'));
    expect(siteFileFor('/site', base, '/other/index.html')).toBeNull();
    expect(siteFileFor('/site', base, '/kurs/..%2F..%2Fetc%2Fpasswd')).toBeNull();
  });
});

describe('planSlidesPdf', () => {
  test('бере лише теми з презентацією і рахує слайди з slides.yaml', async () => {
    const jobs = await planSlidesPdf(course, ROOT, workspace);
    const t01 = course.topics.find((topic) => topic.id === 't01');
    const deck = parse(await readFile(join(ROOT, 'content/modules/m1/t01/slides.yaml'), 'utf8')) as { slides: unknown[] };
    expect(jobs.map((job) => job.topic)).toContain('t01');
    expect(jobs.find((job) => job.topic === 't01')).toEqual({
      topic: 't01',
      slug: t01?.slug,
      page: `temy/${t01?.slug}/prezentatsiia/`,
      slides: deck.slides.length,
      outFile: join(workspace, slidesPdfName('t01', t01?.slug ?? '')),
    });
  });

  test('на запит конкретної теми без презентації або поза реєстром — помилка', async () => {
    const withoutSlides = course.topics.find((topic) => !existsSync(join(ROOT, 'content/modules', topic.module, topic.id, 'slides.yaml')));
    if (withoutSlides) await expect(planSlidesPdf(course, ROOT, workspace, [withoutSlides.id])).rejects.toThrow(/немає презентації/);
    await expect(planSlidesPdf(course, ROOT, workspace, ['t99'])).rejects.toThrow(/немає в реєстрі/);
  });
});

describe('runSlidesPdfCli', () => {
  const io = () => {
    const lines = { stdout: [] as string[], stderr: [] as string[] };
    return { lines, io: { stdout: (line: string) => lines.stdout.push(line), stderr: (line: string) => lines.stderr.push(line) } };
  };

  test('пояснює використання і відхиляє невідомі аргументи', async () => {
    const help = io();
    expect(await runSlidesPdfCli(['--help'], help.io)).toBe(0);
    expect(help.lines.stdout.join('\n')).toContain('--topic');
    const wrong = io();
    expect(await runSlidesPdfCli(['--pages', '3'], wrong.io)).toBe(2);
  });

  test('без зібраної сторінки просить зібрати сайт', async () => {
    const run = io();
    expect(await runSlidesPdfCli(['--dist', join(workspace, 'empty-dist'), '--out', join(workspace, 'none'), '--topic', 't01'], run.io)).toBe(1);
    expect(run.lines.stderr.join('\n')).toContain('npm run build');
  });

  // Друк потребує зібраного сайту (npm run build) і poppler (pdfinfo, pdftotext); без них тест пропускається явно.
  const canPrint = existsSync(join(DIST, 'temy', T01_SLUG, 'prezentatsiia', 'index.html')) && hasCommand('pdftotext') && hasCommand('pdfinfo');

  test.skipIf(!canPrint)('друкує презентацію теми 1 зі зібраного сайту: сторінок стільки ж, скільки слайдів, текст — кирилицею', async () => {
    const out = join(workspace, 'pdf');
    const run = io();
    const code = await runSlidesPdfCli(['--dist', DIST, '--out', out, '--topic', 't01'], run.io);
    expect(run.lines.stderr).toEqual([]);
    expect(code).toBe(0);

    const file = join(out, slidesPdfName('t01', T01_SLUG));
    const deck = parse(await readFile(join(ROOT, 'content/modules/m1/t01/slides.yaml'), 'utf8')) as { slides: unknown[] };
    const info = execFileSync('pdfinfo', [file], { encoding: 'utf8' });
    expect(Number(/^Pages:\s+(\d+)/m.exec(info)?.[1])).toBe(deck.slides.length);
    expect(info).toMatch(/Page size:\s+720 x 404\.8\d? pts/);

    const text = execFileSync('pdftotext', ['-enc', 'UTF-8', file, '-'], { encoding: 'utf8' });
    expect(text.split('\f').filter((page) => page.trim() !== '')).toHaveLength(deck.slides.length);
    expect(text).toContain('Корпорація і корпоративне управління');
    expect(text).toContain('Агентські витрати');
    expect(text).not.toContain('Нотатки доповідача');
  }, PRINT_TIMEOUT_MS);
});
