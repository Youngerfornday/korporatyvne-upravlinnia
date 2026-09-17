import { describe, expect, it } from 'vitest';
import { CourseSchema } from '../../content/schemas/course';
import { loadCourse } from '../../content/schemas/__fixtures__/course';
import { e2eBankQuestions } from '../quiz/__fixtures__/e2e-bank';
import { fixtureManifest } from './__fixtures__/manifest';
import { buildCatalog } from './catalog';
import {
  archiveEntries,
  archiveFileName,
  availableFormats,
  downloadableFiles,
  folderOf,
  isSelectable,
  readmeText,
  safeName,
  selectionDetail,
  summarizeSelection,
} from './selection';
import { formatBytes, formatChipLabel, formatLabel, kindLabel, selectionLine } from './texts';
import type { Material } from './types';

const catalog = buildCatalog({
  course: CourseSchema.parse(loadCourse()),
  lectures: [{ id: 't01', updatedAt: '2026-09-15' }],
  glossaries: [{ topic: 't01', terms: ['Корпорація'] }],
  questions: e2eBankQuestions(),
  practicalFiles: [{ id: 'p01' }],
  manifest: fixtureManifest(),
  url: (path) => `/korporatyvne-upravlinnia/${path}`,
});

function byId(id: string): Material {
  const material = catalog.materials.find((candidate) => candidate.id === id);
  if (!material) throw new Error(id);
  return material;
}

const ALL_FORMATS = ['pdf', 'docx', 'xml', 'zip'] as const;

describe('вибір матеріалів', () => {
  it('файли для архіву: лише вибрані формати, для студента — без файлів викладача', () => {
    expect(downloadableFiles(byId('lecture-t01'), 'teacher', ['pdf']).map((f) => f.id)).toEqual(['t01-lecture-pdf']);
    expect(downloadableFiles(byId('lecture-t01'), 'student', [...ALL_FORMATS]).map((f) => f.id)).toEqual(['t01-lecture-pdf']);
    expect(isSelectable(byId('bank-t01'), 'student')).toBe(false);
    expect(isSelectable(byId('lecture-t02'), 'teacher')).toBe(false);
    expect(availableFormats(catalog.materials, 'teacher')).toEqual(['pdf', 'docx', 'xml', 'zip']);
  });

  it('підсумок: кількість матеріалів, файли, байти й опис за типами', () => {
    const ids = ['lecture-t01', 'bank-t01', 'practical-p01', 'lecture-t02'];
    const summary = summarizeSelection(catalog.materials, ids, 'teacher', [...ALL_FORMATS]);
    expect(summary.materials.map((m) => m.id)).toEqual(['lecture-t01', 'bank-t01', 'practical-p01']);
    expect(summary.files).toHaveLength(4);
    expect(summary.bytes).toBe(1_468_006 + 312_400 + 96_512 + 640_000);
    expect(selectionDetail(summary)).toBe('1 лекція, 1 практична, 1 тест · 4 файли');
    expect(selectionLine(summary.materials.length, summary.bytes)).toBe('Вибрано 3 матеріали · 2,4\u00A0МБ');
    expect(selectionDetail(summarizeSelection(catalog.materials, [], 'teacher', ['pdf']))).toBe('0 файлів');
  });
});

describe('структура архіву й README', () => {
  it('теки «Модуль 1/Тема 01», «Модуль 1/Практична 01», «Курс»; безпечні назви', () => {
    expect(folderOf(byId('lecture-t01'))).toBe('Модуль 1/Тема 01');
    expect(folderOf(byId('practical-p01'))).toBe('Модуль 1/Практична 01');
    expect(folderOf(byId('file-m1-questions-xml'))).toBe('Модуль 1');
    expect(folderOf(byId('file-syllabus-docx'))).toBe('Курс');
    expect(safeName('Тема 1: «Що?» / <відповідь>. ')).toBe('Тема 1 «Що » відповідь');
    expect(safeName('   ')).toBe('файл');
    expect(safeName('а'.repeat(120))).toHaveLength(91);
  });

  it('однакові назви в одній теці отримують номер', () => {
    const lecture = byId('lecture-t01');
    const twin = { ...lecture.files[0]!, id: 'twin' };
    const summary = { materials: [lecture], files: [{ material: lecture, file: lecture.files[0]! }, { material: lecture, file: twin }], bytes: 0 };
    expect(archiveEntries(summary).map((e) => e.path)).toEqual([
      'Модуль 1/Тема 01/Лекція 1. Корпорація і корпоративне управління.pdf',
      'Модуль 1/Тема 01/Лекція 1. Корпорація і корпоративне управління (2).pdf',
    ]);
  });

  it('README перелічує файли з адресами й джерелом; назва архіву за датою Києва', () => {
    const summary = summarizeSelection(catalog.materials, ['lecture-t01', 'file-syllabus-docx'], 'teacher', ['pdf', 'docx']);
    const entries = archiveEntries(summary);
    const collectedAt = new Date('2026-09-17T21:30:00Z');
    const text = readmeText(entries, {
      courseTitle: 'Корпоративне управління',
      sourceUrl: 'https://example.org/korporatyvne-upravlinnia/kabinet/',
      collectedAt,
      manifestGeneratedAt: '2026-09-16T09:30:00Z',
      absoluteUrl: (href) => `https://example.org${href}`,
    });
    expect(text).toContain('Джерело: https://example.org/korporatyvne-upravlinnia/kabinet/');
    expect(text).toContain('Зібрано: 18.09.2026, 00:30 (Київ)');
    expect(text).toContain('Склад: 2 файли, 1,4\u00A0МБ');
    expect(text).toContain('Курс/Силабус дисципліни.docx');
    expect(text).toContain('https://example.org/korporatyvne-upravlinnia/downloads/m1/t01/lecture.pdf');
    expect(text).toContain('\r\n');
    expect(archiveFileName(collectedAt)).toBe('korporatyvne-upravlinnia-materialy-2026-09-18.zip');
    const noManifest = readmeText(entries, { courseTitle: 'К', sourceUrl: 's', collectedAt, manifestGeneratedAt: null, absoluteUrl: (h) => h });
    expect(noManifest).not.toContain('Версія матеріалів');
  });
});

describe('тексти', () => {
  it('розміри файлів українською', () => {
    expect(formatBytes(512)).toBe('512\u00A0Б');
    expect(formatBytes(96 * 1024)).toBe('96\u00A0КБ');
    expect(formatBytes(1100)).toBe('1\u00A0КБ');
    expect(formatBytes(1.4 * 1024 * 1024)).toBe('1,4\u00A0МБ');
  });

  it('підписи форматів і видів мають запасний варіант для нових значень схеми', () => {
    expect(formatLabel('xml')).toBe('XML');
    expect(formatChipLabel('xml')).toBe('Moodle XML');
    expect(formatLabel('new' as never)).toBe('NEW');
    expect(formatChipLabel('new' as never)).toBe('NEW');
    expect(kindLabel('scorm')).toBe('SCORM 1.2');
    expect(kindLabel('new' as never)).toBe('Файл');
  });
});
