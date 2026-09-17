import { beforeAll, describe, expect, test } from 'vitest';
import type { Course } from '../../../src/content/schemas/course.ts';
import { readZip } from '../unzip.ts';
import { loadCourse, numberUk, tableWithHeaders, viewDocx, type DocxView } from '../test-support/docx-xml.ts';
import { createContext } from './context.ts';
import { collectNotes, createNoteMarker } from './notes.ts';
import { packDocx, stableRelationshipIds } from './pack.ts';
import { SYLLABUS_SECTION_TITLES, buildSyllabus } from './syllabus.ts';
import { bookReference } from './literature.ts';
import { activityLabel } from './policies.ts';

/** Силабус, відтворюваність DOCX і примітки для погодження. */

const DATE = new Date('2026-09-17T00:00:00.000Z');
const SITE_URL = 'https://youngerfornday.github.io/korporatyvne-upravlinnia/';

let course: Course;
let docx: Buffer;
let view: DocxView;

beforeAll(async () => {
  course = await loadCourse();
  docx = await packDocx(buildSyllabus(course, { siteUrl: SITE_URL, date: DATE }), DATE);
  view = viewDocx(docx);
});

describe('силабус', () => {
  test('розділи силабусу за Положенням: загальна інформація, результати, оцінювання, політики, календар, література', () => {
    const headings = view.paragraphs.filter((p) => p.style === 'Heading1').map((p) => p.text);
    expect(headings).toEqual(SYLLABUS_SECTION_TITLES.map((title, index) => `${index + 1}. ${title}`));
  });

  test('загальна інформація містить спеціальність, статус, обсяг, форму контролю і сайт курсу', () => {
    const info = tableWithHeaders(view, ['Показник', 'Значення']);
    const value = (label: string): string | undefined => info.find((row) => row[0] === label)?.[1];
    expect(value('Спеціальність')).toBe(course.program.specialtyRecord.value);
    expect(value('Форма семестрового контролю')).toBe(course.program.finalControl.value);
    expect(value('Сайт курсу')).toBe(SITE_URL);
  });

  test('усі теми з результатами й кодами ПРН, години сходяться', () => {
    const text = view.paragraphs.map((p) => p.text).join('\n');
    for (const topic of course.topics) expect(text).toContain(topic.results[0]?.statement.slice(0, 30));
    const hours = tableWithHeaders(view, ['Назва модуля і теми', 'СРС']);
    expect(hours.find((row) => row[0] === 'Усього годин')?.slice(1).map(numberUk)).toEqual([120, 32, 16, 72]);
    const outcomes = tableWithHeaders(view, ['Код', 'Програмний результат навчання']);
    expect(outcomes).toHaveLength(course.learningOutcomes.length + 1);
  });

  test('календар і література: усі тижні й видання', () => {
    const calendar = tableWithHeaders(view, ['Тиждень', 'Види робіт']);
    expect(calendar).toHaveLength(course.calendar.schedule.length + 1);
    const text = view.paragraphs.map((p) => p.text).join('\n');
    for (const book of [...course.literature.main, ...course.literature.additional]) expect(text).toContain(book.title.slice(0, 20));
    expect(view.xml.rels).toContain('TargetMode="External"');
  });
});

describe('відтворюваний DOCX', () => {
  test('дві збірки дають однакові байти, дати й ID посилань сталі', async () => {
    const again = await packDocx(buildSyllabus(course, { siteUrl: SITE_URL, date: DATE }), DATE);
    expect(again.equals(docx)).toBe(true);
    expect(view.xml.core).toContain('<dcterms:created xsi:type="dcterms:W3CDTF">2026-09-17T00:00:00Z</dcterms:created>');
    expect(view.xml.rels).toMatch(/Id="rIdLink1"/);
    expect(view.xml.rels).not.toMatch(/rId[a-z0-9_-]{21}"/);
  });

  test('заміна випадкових ID зв’язків однакова в document.xml і .rels; інші файли не змінюються', () => {
    const random = 'rIdabcdefghijklmnopqrstu';
    const entries = [
      { path: 'word/document.xml', data: Buffer.from(`<a r:id="${random}"/>`) },
      { path: 'word/_rels/document.xml.rels', data: Buffer.from(`<Relationship Id="${random}"/>`) },
      { path: 'word/styles.xml', data: Buffer.from(random) },
    ];
    const [document, rels, styles] = stableRelationshipIds(entries).map((entry) => Buffer.from(entry.data).toString('utf8'));
    expect(document).toBe('<a r:id="rIdLink1"/>');
    expect(rels).toBe('<Relationship Id="rIdLink1"/>');
    expect(styles).toBe(random);
    expect(stableRelationshipIds(entries.slice(0, 1))).toEqual(entries.slice(0, 1));
  });

  test('архів містить обов’язкові частини OOXML', () => {
    const paths = readZip(docx).map((entry) => entry.path);
    expect(paths).toEqual(expect.arrayContaining(['[Content_Types].xml', '_rels/.rels', 'word/document.xml', 'word/styles.xml', 'word/comments.xml']));
  });
});

describe('примітки й допоміжні записи', () => {
  test('поле без needsConfirmation не отримує примітки; кожна позначка — окремий ID', () => {
    const confirmed: Course = {
      ...course,
      teacher: { ...course.teacher, isPlaceholder: false, position: 'доцент' },
      program: { ...course.program, semester: { value: '3 курс, 5 семестр', needsConfirmation: false } },
    };
    const notes = collectNotes(confirmed);
    expect(notes.map((note) => note.key)).not.toContain('semester');
    expect(notes.map((note) => note.key)).not.toContain('teacher');
    const marker = createNoteMarker(notes);
    expect(marker.mark('semester', '3 курс')).toBe('3 курс');
    expect(marker.mark('department', 'Кафедра')).toEqual({ text: 'Кафедра', comment: 0 });
    expect(marker.mark('department', 'Кафедра')).toEqual({ text: 'Кафедра', comment: 1 });
    expect(marker.placed().map((note) => note.id)).toEqual([0, 1]);
    expect(createContext(confirmed, { siteUrl: SITE_URL, date: DATE }).nextListInstance()).toBe(1);
  });

  test('бібліографічний запис: автори, назва, видання, місце, видавець, рік, ISBN і DOI', () => {
    const book = course.literature.main.find((candidate) => candidate.doi !== undefined && candidate.place !== undefined);
    expect(book).toBeDefined();
    const parts = bookReference(book!);
    const text = parts.map((part) => (typeof part === 'string' ? part : part.text)).join('');
    expect(text).toContain(`${book!.place} : ${book!.publisher}, ${book!.year}. ISBN ${book!.isbn}.`);
    expect(parts.at(-1)).toEqual({ text: book!.doi, link: book!.doi });
  });

  test('підписи календаря для кожного виду робіт', () => {
    expect(activityLabel(course, { type: 'lecture', topic: 't01' })).toBe(`Лекція (2 год): Тема 1. ${course.topics[0]?.title}`);
    expect(activityLabel(course, { type: 'practical', practical: 'p01' })).toContain('Практична робота 1 (2 год)');
    expect(activityLabel(course, { type: 'module-test', module: 'm2' })).toBe('Модульний тест: модуль 2');
    expect(activityLabel(course, { type: 'case-project', stage: 'cp-select' })).toBe('Кейс-проєкт: Вибір компанії');
    expect(activityLabel(course, { type: 'final-test' })).toBe('Підсумковий тест');
  });
});
