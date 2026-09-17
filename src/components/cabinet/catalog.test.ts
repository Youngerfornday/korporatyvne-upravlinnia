import { describe, expect, it } from 'vitest';
import { CourseSchema, type Course } from '../../content/schemas/course';
import { loadCourse } from '../../content/schemas/__fixtures__/course';
import { e2eBankQuestions } from '../quiz/__fixtures__/e2e-bank';
import { fixtureManifest, E2E_BACKUP_URL } from './__fixtures__/manifest';
import { buildCatalog, type CatalogInput } from './catalog';
import type { Material } from './types';

const course: Course = CourseSchema.parse(loadCourse());
const url = (path: string) => `/base/${path}`;

function input(overrides: Partial<CatalogInput> = {}): CatalogInput {
  return {
    course,
    lectures: [{ id: 't01', updatedAt: '2026-09-15' }],
    glossaries: [{ topic: 't01', terms: ['Корпорація', 'Агент', 'Принципал', 'Агентські витрати', 'Стейкхолдер'] }],
    questions: e2eBankQuestions(),
    practicalFiles: [{ id: 'p01', updatedAt: '2026-09-17' }],
    manifest: null,
    url,
    ...overrides,
  };
}

function byId(materials: readonly Material[], id: string): Material {
  const material = materials.find((candidate) => candidate.id === id);
  if (!material) throw new Error(`Немає матеріалу ${id}`);
  return material;
}

describe('buildCatalog без маніфесту', () => {
  const catalog = buildCatalog(input());

  it('лекції всіх тем: опублікована тема з датою, решта — «готується»', () => {
    const lectures = catalog.materials.filter((m) => m.type === 'lecture');
    expect(lectures).toHaveLength(course.topics.length);
    const first = byId(catalog.materials, 'lecture-t01');
    expect(first).toMatchObject({ status: 'published', title: `Лекція 1. ${course.topics[0]?.title}`, updatedLabel: '15.09.2026', moduleNumber: 1 });
    expect(first.outcomes).toEqual(['ПРН3', 'ПРН12', 'ПРН15']);
    expect(first.href).toBe(`/base/temy/${course.topics[0]?.slug}/`);
    expect(byId(catalog.materials, 'lecture-t02').status).toBe('pending');
  });

  it('тренувальний банк: розподіл за Блумом і типами, посилання на тест і оглядач', () => {
    const bank = byId(catalog.materials, 'bank-t01');
    const questions = e2eBankQuestions();
    expect(bank.questionCount).toBe(questions.length);
    const bloomTotal = Object.values(bank.bloom ?? {}).reduce((sum, n) => sum + n, 0);
    expect(bloomTotal).toBe(questions.length);
    expect(bank.questionTypes?.reduce((sum, t) => sum + t.count, 0)).toBe(questions.length);
    expect(bank.bankHref).toBe(`/base/kabinet/bank/${course.topics[0]?.slug}/`);
    expect(catalog.materials.some((m) => m.id === 'bank-t02')).toBe(false);
  });

  it('глосарій теми з кількістю термінів і пошуком за терміном', () => {
    const glossary = byId(catalog.materials, 'glossary-t01');
    expect(glossary.subtitle).toBe('5 термінів: Корпорація, Агент, Принципал, Агентські витрати…');
    expect(byId(catalog.materials, 'lecture-t01').searchText).toContain('агентські витрати');
  });

  it('практичні з реєстру: з файлом тренажера — опубліковані, без — «готується»; посилання лише для опублікованих', () => {
    const withPath = buildCatalog(input({ practicalPath: (id) => `praktychni/${id}/` }));
    expect(byId(withPath.materials, 'practical-p01')).toMatchObject({ status: 'published', practicalNumber: 1, href: 'praktychni/p01/' });
    expect(byId(withPath.materials, 'practical-p02').status).toBe('pending');
    expect(byId(withPath.materials, 'practical-p02').href).toBeUndefined();
    expect(catalog.materials.filter((m) => m.type === 'practical')).toHaveLength(course.practicals.length);
  });

  it('порядок: модуль → тема → вид; лічильники курсу', () => {
    const ids = catalog.materials.map((m) => m.id);
    expect(ids.indexOf('lecture-t01')).toBeLessThan(ids.indexOf('bank-t01'));
    expect(ids.indexOf('bank-t01')).toBeLessThan(ids.indexOf('lecture-t02'));
    expect(catalog.manifestGeneratedAt).toBeNull();
    expect(catalog.packages).toEqual([]);
    expect(catalog.topicCount).toBe(course.topics.length);
    expect(catalog.outcomeCount).toBe(course.learningOutcomes.length);
    expect(catalog.updatedLabel).toBe('17.09.2026');
  });
});

describe('buildCatalog з маніфестом', () => {
  const catalog = buildCatalog(input({ manifest: fixtureManifest() }));

  it('файли прив’язуються до лекції, банку, глосарію й практичної', () => {
    expect(byId(catalog.materials, 'lecture-t01').files.map((f) => f.id)).toEqual(['t01-lecture-pdf', 't01-book-zip']);
    expect(byId(catalog.materials, 'bank-t01').files.map((f) => f.id)).toEqual(['t01-questions-xml']);
    expect(byId(catalog.materials, 'glossary-t01').files.map((f) => f.id)).toEqual(['t01-glossary-xml']);
    expect(byId(catalog.materials, 'practical-p01').files.map((f) => f.id)).toEqual(['p01-practical-pdf']);
    const pdf = byId(catalog.materials, 'lecture-t01').files[0];
    expect(pdf).toMatchObject({ href: '/base/downloads/m1/t01/lecture.pdf', external: false, extension: 'pdf', moduleNumber: 1 });
  });

  it('файли без відповідника стають окремими матеріалами; пакети — окремо', () => {
    expect(byId(catalog.materials, 'file-syllabus-docx')).toMatchObject({ type: 'document', status: 'published' });
    expect(byId(catalog.materials, 'file-m1-questions-xml')).toMatchObject({ type: 'bank', moduleNumber: 1, subtitle: 'Усі питання тренувальних тестів модуля одним файлом.' });
    expect(catalog.packages.map((p) => p.id)).toEqual(['m1-bundle', 'course-backup']);
    expect(catalog.packages[1]).toMatchObject({ href: E2E_BACKUP_URL, external: true, extension: 'mbz' });
    expect(catalog.manifestGeneratedAt).toBe('2026-09-16T09:30:00Z');
  });

  it('файл теми без матеріалу реєстру не губиться', () => {
    const manifest = fixtureManifest();
    const orphan = { ...manifest.items[3]!, id: 't05-questions-xml', topic: 't05', module: 'm2', path: 'downloads/m2/t05.xml' };
    const result = buildCatalog(input({ manifest: { ...manifest, items: [orphan] } }));
    expect(byId(result.materials, 'bank-t05')).toMatchObject({ type: 'bank', topicNumber: 5, moduleNumber: 2 });
  });
});
