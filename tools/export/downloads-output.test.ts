import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';
import { checkDownloadsDir } from './downloads-verify.ts';
import { loadCourse, tableWithHeaders, viewDocx } from './test-support/docx-xml.ts';
import { readZip } from './unzip.ts';

/**
 * Перевірка справжнього результату `npm run build:downloads` у public/downloads: маніфест, кирилиця в PDF
 * (pdftotext), таблиці DOCX, цілісність архівів. Якщо матеріали ще не згенеровано, тести пропускаються;
 * у CI крок генерації йде перед тестами.
 */

const DOWNLOADS = fileURLToPath(new URL('../../public/downloads/', import.meta.url));
const generated = existsSync(join(DOWNLOADS, 'manifest.json'));
const hasPoppler = spawnSync('pdftotext', ['-v']).error === undefined;

describe.skipIf(!generated)('згенеровані матеріали public/downloads', () => {
  test('маніфест валідний, файли на місці, розміри збігаються', async () => {
    const { manifest, issues } = await checkDownloadsDir(DOWNLOADS);
    expect(issues).toEqual([]);
    expect(manifest?.items.some((item) => item.kind === 'lecture')).toBe(true);
    expect(manifest?.items.some((item) => item.kind === 'backup' && item.url?.endsWith('.mbz'))).toBe(true);
  });

  test.skipIf(!hasPoppler)('PDF лекцій і практичних: A4, теги, кирилиця шрифтом сайту', async () => {
    const { manifest } = await checkDownloadsDir(DOWNLOADS);
    const pdfs = manifest?.items.filter((item) => item.format === 'pdf') ?? [];
    expect(pdfs.length).toBeGreaterThanOrEqual(2);
    for (const item of pdfs) {
      const file = join(DOWNLOADS, item.path?.replace(/^downloads\//, '') ?? '');
      const info = execFileSync('pdfinfo', [file], { encoding: 'utf8' });
      expect(info).toMatch(/Tagged:\s+yes/);
      expect(info).toMatch(/\(A4\)/);
      const text = execFileSync('pdftotext', ['-enc', 'UTF-8', '-l', '3', file, '-'], { encoding: 'utf8' }).replace(/\s+/g, ' ');
      const titleWords = item.title.replace(/^Лекція\. /, '').split(/[\s.]+/).filter((word) => /^[А-ЯІЇЄҐа-яіїєґ’]{6,}$/.test(word));
      expect(titleWords.length).toBeGreaterThan(0);
      for (const word of titleWords) expect(text, `${item.id}: ${word}`).toContain(word);
      expect(text).toContain('Чернігівська політехніка');
      expect(execFileSync('pdffonts', [file], { encoding: 'utf8' })).toContain('OpenSans');
    }
  });

  test('DOCX: таблиці годин і балів, усі ПРН у робочій програмі', async () => {
    const course = await loadCourse();
    const view = viewDocx(await readFile(join(DOWNLOADS, 'course/work-program.docx')));
    expect(view.tables.length).toBeGreaterThan(10);
    expect(tableWithHeaders(view, ['Назва модуля і теми', 'СРС']).at(-1)?.[1]).toBe(String(course.hours.total));
    expect(tableWithHeaders(view, ['Вид роботи', 'Максимум балів']).at(-1)?.at(-1)).toBe('100');
    const text = [...view.paragraphs.map((p) => p.text), ...view.tables.flat(2)].join('\n');
    for (const outcome of course.learningOutcomes) expect(text).toContain(outcome.statement.slice(0, 40));
    const syllabus = viewDocx(await readFile(join(DOWNLOADS, 'course/syllabus.docx')));
    expect(syllabus.paragraphs.some((p) => p.text === 'Силабус навчальної дисципліни')).toBe(true);
  });

  test('архіви розпаковуються, пакети мають README.txt', async () => {
    const { manifest } = await checkDownloadsDir(DOWNLOADS);
    for (const item of manifest?.items.filter((candidate) => candidate.format === 'zip') ?? []) {
      const entries = readZip(await readFile(join(DOWNLOADS, item.path?.replace(/^downloads\//, '') ?? '')));
      expect(entries.length, item.id).toBeGreaterThan(0);
      if (item.kind === 'bundle') expect(entries[0]?.path.endsWith('/README.txt')).toBe(true);
    }
  });
});
