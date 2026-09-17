import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { stringify } from 'yaml';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { loadCourse } from '../../src/content/schemas/__fixtures__/course.ts';
import { BOOKS_MANIFEST, runBookCli } from './book-cli.ts';
import { joinSiteUrl } from './site-url.ts';

/** CLI архівів Книги: сторінка теми зі зібраного сайту → ZIP на тему плюс маніфест. */

const SITE = 'https://example.github.io/kurs/';

let workspace: string;
const lines: { stdout: string[]; stderr: string[] } = { stdout: [], stderr: [] };
const io = {
  stdout: (line: string) => lines.stdout.push(line),
  stderr: (line: string) => lines.stderr.push(line),
};

function topicPage(body: string): string {
  return `<!DOCTYPE html><html lang="uk"><body><article data-topic-article>${body}</article></body></html>`;
}

beforeEach(async () => {
  workspace = await mkdtemp(join(tmpdir(), 'ku-book-cli-'));
  lines.stdout = [];
  lines.stderr = [];
});

afterEach(async () => {
  await rm(workspace, { recursive: true, force: true });
});

/**
 * Реєстр курсу для тесту — копія справжнього content/course.yaml (як у тестах схем): скласти
 * мінімальний валідний course.yaml неможливо, бо схема звіряє години, бали й реєстр ID між собою.
 */
async function writeCourse(): Promise<{ file: string; topics: ReadonlyArray<{ id: string; slug: string }> }> {
  const course = loadCourse() as { topics: ReadonlyArray<{ id: string; slug: string }> };
  const file = join(workspace, 'course.yaml');
  await writeFile(file, stringify(course), 'utf8');
  return { file, topics: course.topics };
}

async function writePage(slug: string, html: string): Promise<void> {
  const dir = join(workspace, 'dist', 'temy', slug);
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, 'index.html'), html, 'utf8');
}

describe('npm run export:book', () => {
  test('складає архів на кожну опубліковану тему і пише маніфест', async () => {
    const { file: courseFile, topics } = await writeCourse();
    const [published, unpublished] = topics as [{ id: string; slug: string }, { id: string; slug: string }];
    await writePage(published.slug, topicPage('<h2>Розділ</h2><p>Текст.</p>'));
    await writePage(unpublished.slug, '<html><body><p>ще не опубліковано</p></body></html>');

    const code = await runBookCli(
      ['--dist', join(workspace, 'dist'), '--course', courseFile, '--out', join(workspace, 'books'), '--site', SITE],
      io,
      workspace,
    );
    const manifest = JSON.parse(await readFile(join(workspace, 'books', BOOKS_MANIFEST), 'utf8'));

    expect(code).toBe(0);
    expect(manifest.books).toHaveLength(1);
    expect(manifest.books[0]).toMatchObject({ topic: published.id, file: `${published.id}.zip`, chapters: ['Розділ'] });
    expect(manifest.skipped.map((item: { topic: string }) => item.topic)).toContain(unpublished.id);
    expect(manifest.site).toBe(SITE);
  });

  test('тема без сторінки в dist пропускається з поясненням, а не ламає збірку', async () => {
    const { file: courseFile } = await writeCourse();
    await mkdir(join(workspace, 'dist'), { recursive: true });

    const code = await runBookCli(
      ['--dist', join(workspace, 'dist'), '--course', courseFile, '--out', join(workspace, 'books'), '--site', SITE],
      io,
      workspace,
    );
    const manifest = JSON.parse(await readFile(join(workspace, 'books', BOOKS_MANIFEST), 'utf8'));

    expect(code).toBe(0);
    expect(manifest.books).toHaveLength(0);
    expect(manifest.skipped[0].reason).toContain('зберіть сайт');
  });

  test('невалідний реєстр курсу — код 1 і звіт українською', async () => {
    const courseFile = join(workspace, 'course.yaml');
    await writeFile(courseFile, 'schemaVersion: 2\n', 'utf8');

    const code = await runBookCli(['--course', courseFile, '--site', SITE, '--out', join(workspace, 'books')], io, workspace);

    expect(code).toBe(1);
    expect(lines.stderr.join('\n')).toContain('не проходить валідацію');
  });

  test('невідомий параметр — код 2 і підказка', async () => {
    expect(await runBookCli(['--невідомо'], io, workspace)).toBe(2);
    expect(lines.stderr.join('\n')).toContain('Використання:');
  });

  test('--help друкує підказку', async () => {
    expect(await runBookCli(['--help'], io, workspace)).toBe(0);
    expect(lines.stdout.join('\n')).toContain('Використання:');
  });
});

describe('адреса сайту', () => {
  test('site і base склеюються в один корінь із кінцевою скісною рискою', () => {
    expect(joinSiteUrl('https://example.github.io', '/kurs')).toBe('https://example.github.io/kurs/');
    expect(joinSiteUrl('https://example.github.io/', undefined)).toBe('https://example.github.io/');
  });
});
