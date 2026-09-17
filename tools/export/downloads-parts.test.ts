import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import type { Course } from '../../src/content/schemas/course.ts';
import { DownloadItemSchema, type DownloadItem } from '../../src/content/schemas/downloads.ts';
import { bundleMembers, formatSize, memberPath, readmeText } from './downloads-bundle.ts';
import {
  backupItem,
  bookItem,
  courseBundleItem,
  glossaryItem,
  lectureItem,
  moduleBundleItem,
  orderItems,
  practicalItem,
  questionBankItem,
  syllabusItem,
  workProgramItem,
} from './downloads-items.ts';
import { latestDate, loadDownloadSources } from './downloads-sources.ts';
import { checkDownloadsDir } from './downloads-verify.ts';
import { loadCourse } from './test-support/docx-xml.ts';

/** Частини оркестратора: елементи маніфесту, порядок, README пакетів, джерела й перевірка каталогу. */

const ROOT = new URL('../../', import.meta.url).pathname;
const file = (name: string, bytes = 100) => ({ file: name, bytes });
let course: Course;

beforeAll(async () => {
  course = await loadCourse();
});

function topic(id: string): Course['topics'][number] {
  const found = course.topics.find((candidate) => candidate.id === id);
  if (!found) throw new Error(id);
  return found;
}

function allItems(): DownloadItem[] {
  const practical = course.practicals.find((candidate) => candidate.module === 'm2');
  if (!practical) throw new Error('немає практичної модуля 2');
  return [
    backupItem({ url: 'https://example.com/course.mbz', bytes: 5, moodle: '5.2.2' }),
    courseBundleItem(file('course/all.zip')),
    glossaryItem(course, { kind: 'course' }, file('moodle/glossary-course.xml'), 150),
    questionBankItem(course, { kind: 'final' }, file('moodle/questions-training-final.xml'), 120),
    questionBankItem(course, { kind: 'course' }, file('moodle/questions-training-course.xml'), 180),
    moduleBundleItem(course, 'm2', file('m2/all.zip')),
    lectureItem(course, topic('t05'), file('m2/lecture-t05.pdf'), 1),
    practicalItem(course, practical, file(`m2/practical-${practical.id}.pdf`), 3),
    moduleBundleItem(course, 'm1', file('m1/all.zip')),
    glossaryItem(course, { kind: 'module', module: 'm1' }, file('moodle/glossary-m1.xml'), 1),
    questionBankItem(course, { kind: 'module', module: 'm1' }, file('moodle/questions-training-m1.xml'), 22),
    bookItem(course, topic('t02'), file('moodle/book-t02.zip'), 5, 2),
    bookItem(course, topic('t01'), file('moodle/book-t01.zip'), 1, 0),
    lectureItem(course, topic('t02'), file('m1/lecture-t02.pdf'), 12),
    lectureItem(course, topic('t01'), file('m1/lecture-t01.pdf'), 41),
    workProgramItem(course, file('course/work-program.docx')),
    syllabusItem(course, file('course/syllabus.docx')),
  ];
}

describe('елементи маніфесту', () => {
  test('кожен елемент проходить схему маніфесту', () => {
    for (const item of allItems()) expect(DownloadItemSchema.safeParse(item).success, item.id).toBe(true);
  });

  test('описи з українськими формами множини', () => {
    const items = new Map(allItems().map((item) => [item.id, item]));
    expect(items.get('lecture-t01')?.description).toContain('41 сторінка');
    expect(items.get('lecture-t02')?.description).toContain('12 сторінок');
    expect(items.get('lecture-t05')?.description).toContain('1 сторінка');
    expect(items.get('book-t02')?.description).toContain('5 глав, схем — 2');
    expect(items.get('book-t01')?.description).toContain('1 глава');
    expect(items.get('glossary-m1')?.description).toContain('1 термін ');
    expect(items.get('questions-training-m1')?.description).toContain('22 питання');
    expect(items.get('questions-training-final')?.title).toBe('Тренувальні питання підсумкового пулу');
  });

  test('сталий порядок: документи курсу, модулі (пакет модуля останнім), файли курсу, пакет курсу, резервна копія', () => {
    expect(orderItems(course, allItems()).map((item) => item.id)).toEqual([
      'syllabus',
      'work-program',
      'lecture-t01',
      'lecture-t02',
      'book-t01',
      'book-t02',
      'questions-training-m1',
      'glossary-m1',
      'bundle-m1',
      'lecture-t05',
      `practical-${course.practicals.find((candidate) => candidate.module === 'm2')?.id}`,
      'bundle-m2',
      'questions-training-course',
      'questions-training-final',
      'glossary-course',
      'bundle-course',
      'backup-course',
    ]);
  });
});

describe('пакети', () => {
  test('розміри людською мовою', () => {
    expect(formatSize(10)).toBe('1 КБ');
    expect(formatSize(48_609)).toBe('47 КБ');
    expect(formatSize(1_113_109)).toBe('1,1 МБ');
  });

  test('учасники пакета модуля й курсу, шлях у архіві', () => {
    const items = allItems();
    expect(bundleMembers(items, 'm1').map((item) => item.id).sort()).toEqual(['book-t01', 'book-t02', 'glossary-m1', 'lecture-t01', 'lecture-t02', 'questions-training-m1']);
    const courseMembers = bundleMembers(items, undefined).map((item) => item.id);
    expect(courseMembers).toContain('syllabus');
    expect(courseMembers).not.toContain('bundle-m1');
    expect(courseMembers).not.toContain('backup-course');
    expect(memberPath(items.find((item) => item.id === 'syllabus') as DownloadItem)).toBe('course/syllabus.docx');
    expect(() => memberPath(items.find((item) => item.id === 'backup-course') as DownloadItem)).toThrow('не має файлу на сайті');
  });

  test('README без Moodle-файлів і резервної копії не показує розділ про Moodle', () => {
    const members = allItems().filter((item) => item.kind === 'syllabus');
    const text = readmeText({ course, title: 'Документи', members, siteUrl: 'https://example.com/', generatedAt: new Date('2026-09-17T00:00:00Z'), backup: undefined });
    expect(text).not.toContain('Як використати в Moodle');
    expect(text).toContain('course/syllabus.docx  Силабус');
    expect(text).toContain('Згенеровано 17.09.2026');
    expect(text).toContain('CC BY-NC-SA 4.0');
  });
});

describe('джерела й перевірка каталогу', () => {
  let dir: string;

  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), 'ku-downloads-parts-'));
  });

  afterAll(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  test('дата збірки — найпізніша дата контенту; порожній список — помилка', async () => {
    expect(latestDate(['2026-09-16', '2026-09-17', '2026-01-02']).toISOString()).toBe('2026-09-17T00:00:00.000Z');
    expect(() => latestDate([])).toThrow('Немає жодної дати');
    const sources = await loadDownloadSources(ROOT);
    expect(sources.date.getTime()).toBeGreaterThanOrEqual(new Date(`${sources.backup.builtAt}T00:00:00Z`).getTime());
    expect(sources.practicals.every((practical) => sources.course.practicals.some((entry) => entry.id === practical.id))).toBe(true);
  });

  test('каталог без маніфесту, з невалідним маніфестом, відсутнім файлом, іншим розміром чи зайвим файлом', async () => {
    const root = join(dir, 'downloads');
    await mkdir(join(root, 'm1'), { recursive: true });
    expect((await checkDownloadsDir(root)).issues[0]).toContain('manifest.json не прочитано');

    await writeFile(join(root, 'manifest.json'), JSON.stringify({ schemaVersion: 2, generatedAt: 'вчора', items: [] }));
    const invalid = await checkDownloadsDir(root);
    expect(invalid.manifest).toBeNull();
    expect(invalid.issues.join('\n')).toContain('schemaVersion');

    const items = [
      { id: 'lecture-t01', title: 'Лекція', kind: 'lecture', format: 'pdf', path: 'downloads/m1/lecture-t01.pdf', bytes: 3 },
      { id: 'lecture-t02', title: 'Лекція 2', kind: 'lecture', format: 'pdf', path: 'downloads/m1/lecture-t02.pdf', bytes: 3 },
    ];
    await writeFile(join(root, 'manifest.json'), JSON.stringify({ schemaVersion: 1, generatedAt: '2026-09-17T00:00:00.000Z', items }));
    await writeFile(join(root, 'm1/lecture-t01.pdf'), 'PDF!');
    await writeFile(join(root, 'm1/stray.pdf'), 'x');
    const check = await checkDownloadsDir(root);
    expect(check.manifest?.items[0]?.audience).toBe('student');
    expect(check.issues).toEqual([
      '«lecture-t01»: розмір downloads/m1/lecture-t01.pdf — 4 байт, у маніфесті 3',
      '«lecture-t02»: немає файлу downloads/m1/lecture-t02.pdf',
      'файл downloads/m1/stray.pdf не описано в маніфесті',
    ]);
  });
});
