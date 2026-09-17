import { describe, expect, it } from 'vitest';
import { EMPTY_FILTERS, countByType, filterMaterials, nextSort, sortMaterials, visibleFiles } from './filter';
import { matchesQuery, normalizeSearch } from './search';
import type { Material, MaterialFile } from './types';

function file(overrides: Partial<MaterialFile>): MaterialFile {
  return { id: 'f', title: 'Файл', kind: 'lecture', format: 'pdf', audience: 'student', bytes: 100, href: '/f.pdf', external: false, extension: 'pdf', ...overrides };
}

function material(overrides: Partial<Material> & Pick<Material, 'id' | 'type'>): Material {
  return { title: overrides.id, subtitle: '', status: 'published', outcomes: [], searchText: normalizeSearch(overrides.title ?? overrides.id), files: [], order: 0, ...overrides };
}

const lecture1 = material({ id: 'lecture-t01', type: 'lecture', title: 'Лекція 1. Корпорація', moduleId: 'm1', topicNumber: 1, order: 1, updatedAt: '2026-09-15', files: [file({ id: 'a', bytes: 500 })] });
const bank1 = material({
  id: 'bank-t01',
  type: 'bank',
  title: 'Тренувальний тест 1',
  moduleId: 'm1',
  topicNumber: 1,
  order: 2,
  bloom: { remember: 5, understand: 5, apply: 4, analyze: 0 },
  files: [file({ id: 'b', format: 'xml', audience: 'teacher', bytes: 2000 })],
});
const lecture4 = material({ id: 'lecture-t04', type: 'lecture', title: 'Лекція 4. Загальні збори', moduleId: 'm2', topicNumber: 4, order: 3, updatedAt: '2026-09-10' });
const practical = material({ id: 'practical-p01', type: 'practical', title: 'Практична 1. Матриця моделей', moduleId: 'm1', topicNumber: 1, order: 4, files: [file({ id: 'c', bytes: 50 })] });
const all = [lecture1, bank1, lecture4, practical];

describe('normalizeSearch і matchesQuery', () => {
  it('регістр, апострофи, ґ і лапки не впливають на збіг', () => {
    expect(normalizeSearch("  Пам'ять «Ґанок»  ")).toBe('пам’ять ганок');
    expect(matchesQuery(normalizeSearch('Лекція 4. Загальні збори ПРН 3'), 'прн 3 ЗБОРИ')).toBe(true);
    expect(matchesQuery(normalizeSearch('Лекція 4'), 'кворум')).toBe(false);
    expect(matchesQuery('будь-що', '   ')).toBe(true);
  });
});

describe('filterMaterials і countByType', () => {
  it('модуль, тип, пошук', () => {
    expect(filterMaterials(all, { ...EMPTY_FILTERS, moduleId: 'm1' }).map((m) => m.id)).toEqual(['lecture-t01', 'bank-t01', 'practical-p01']);
    expect(filterMaterials(all, { ...EMPTY_FILTERS, types: ['lecture', 'practical'] }).map((m) => m.id)).toEqual(['lecture-t01', 'lecture-t04', 'practical-p01']);
    expect(filterMaterials(all, { ...EMPTY_FILTERS, query: 'збори' }).map((m) => m.id)).toEqual(['lecture-t04']);
  });

  it('рівень Блума лишає лише матеріали з питаннями цього рівня', () => {
    expect(filterMaterials(all, { ...EMPTY_FILTERS, bloom: 'apply' }).map((m) => m.id)).toEqual(['bank-t01']);
    expect(filterMaterials(all, { ...EMPTY_FILTERS, bloom: 'analyze' })).toEqual([]);
  });

  it('лічильник типу не залежить від вибраних типів, але залежить від інших фільтрів', () => {
    const counts = countByType(all, { ...EMPTY_FILTERS, moduleId: 'm1', types: ['bank'] });
    expect(counts).toEqual({ lecture: 1, practical: 1, bank: 1, glossary: 0, document: 0 });
  });
});

describe('visibleFiles і сортування', () => {
  it('студент не бачить файлів для викладача', () => {
    expect(visibleFiles(bank1, 'student')).toEqual([]);
    expect(visibleFiles(bank1, 'teacher')).toHaveLength(1);
  });

  it('за розміром враховує лише видимі файли; рівні значення — порядок курсу', () => {
    const teacher = sortMaterials(all, { key: 'size', direction: 'descending' }, 'teacher').map((m) => m.id);
    expect(teacher).toEqual(['bank-t01', 'lecture-t01', 'practical-p01', 'lecture-t04']);
    const student = sortMaterials(all, { key: 'size', direction: 'descending' }, 'student').map((m) => m.id);
    expect(student).toEqual(['lecture-t01', 'practical-p01', 'bank-t01', 'lecture-t04']);
  });

  it('за назвою, типом, темою, датою і порядком курсу', () => {
    expect(sortMaterials(all, { key: 'title', direction: 'ascending' }, 'teacher')[0]?.id).toBe('lecture-t01');
    expect(sortMaterials(all, { key: 'type', direction: 'ascending' }, 'teacher').map((m) => m.type)).toEqual(['lecture', 'lecture', 'practical', 'bank']);
    expect(sortMaterials(all, { key: 'topic', direction: 'descending' }, 'teacher')[0]?.id).toBe('lecture-t04');
    expect(sortMaterials(all, { key: 'updated', direction: 'descending' }, 'teacher')[0]?.id).toBe('lecture-t01');
    expect(sortMaterials([...all].reverse(), { key: 'order', direction: 'ascending' }, 'teacher').map((m) => m.id)).toEqual(all.map((m) => m.id));
  });

  it('nextSort: новий стовпець за зростанням, повторний клік змінює напрям', () => {
    expect(nextSort({ key: 'order', direction: 'ascending' }, 'title')).toEqual({ key: 'title', direction: 'ascending' });
    expect(nextSort({ key: 'title', direction: 'ascending' }, 'title')).toEqual({ key: 'title', direction: 'descending' });
    expect(nextSort({ key: 'title', direction: 'descending' }, 'title')).toEqual({ key: 'title', direction: 'ascending' });
  });
});
