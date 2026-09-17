/** Серверний рендер острова кабінету: стан без маніфесту матеріалів і з ним (без DOM, через react-dom/server). */
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { CourseSchema } from '../../content/schemas/course';
import { loadCourse } from '../../content/schemas/__fixtures__/course';
import { e2eBankQuestions } from '../quiz/__fixtures__/e2e-bank';
import { fixtureManifest } from './__fixtures__/manifest';
import { CabinetIsland } from './CabinetIsland';
import { buildCatalog, type CatalogInput } from './catalog';
import { ExportPanel } from './ExportPanel';
import { buildOutcomeMatrix } from './matrix';
import { summarizeSelection } from './selection';

const course = CourseSchema.parse(loadCourse());

function catalogWith(manifest: CatalogInput['manifest']) {
  return buildCatalog({
    course,
    lectures: [{ id: 't01', updatedAt: '2026-09-15' }],
    glossaries: [],
    questions: e2eBankQuestions(),
    practicalFiles: [],
    manifest,
    url: (path) => `/base/${path}`,
  });
}

function island(manifest: CatalogInput['manifest']): string {
  return renderToStaticMarkup(
    createElement(CabinetIsland, {
      catalog: catalogWith(manifest),
      matrix: buildOutcomeMatrix(course, new Set(['t01'])),
      moodleGuideHref: '/base/moodle/',
      buildCommand: 'npm run build:downloads',
    }),
  );
}

describe('CabinetIsland (серверний рендер)', () => {
  it('без маніфесту: таблиця матеріалів є, готові пакети пояснюють, як їх зібрати', () => {
    const html = island(null);
    expect(html).toContain('data-materials-table');
    expect(html).toContain('Кабінет викладача');
    expect(html).toContain('npm run build:downloads');
    expect(html).not.toContain('data-package=');
    expect(html).not.toContain('Силабус DOCX');
  });

  it('з маніфестом: пакети, силабус і пам’ятка Moodle', () => {
    const html = island(fixtureManifest());
    expect(html).toContain('data-package="m1-bundle"');
    expect(html).toContain('Силабус DOCX');
    expect(html).toContain('Пам’ятка після запуску тесту в Moodle.');
  });
});

describe('ExportPanel', () => {
  const noop = () => undefined;
  const base = {
    buildCommand: 'npm run build:downloads',
    formats: [],
    chosenFormats: [],
    selectableInFilter: 0,
    zip: { status: 'idle' } as const,
    onToggleFormat: noop,
    onSelectFiltered: noop,
    onClear: noop,
    onBuild: noop,
    onCancel: noop,
  };

  it('без маніфесту — стан «Матеріали ще не зібрано» з командою', () => {
    const summary = summarizeSelection([], [], 'teacher', []);
    const html = renderToStaticMarkup(createElement(ExportPanel, { ...base, hasManifest: false, summary }));
    expect(html).toContain('Матеріали ще не зібрано.');
    expect(html).toContain('<code>npm run build:downloads</code>');
    expect(html).not.toContain('Зібрати ZIP');
  });

  it('з маніфестом — підсумок вибору, чипи форматів і неактивна кнопка без файлів', () => {
    const materials = catalogWith(fixtureManifest()).materials;
    const summary = summarizeSelection(materials, ['lecture-t02'], 'teacher', ['pdf']);
    const html = renderToStaticMarkup(
      createElement(ExportPanel, { ...base, hasManifest: true, summary, formats: ['pdf', 'xml'], chosenFormats: ['pdf'], zip: { status: 'error', message: 'Не вдалося завантажити «А» (помилка 404).' } }),
    );
    expect(html).toContain('Вибрано 0 матеріалів');
    expect(html).toContain('Moodle XML');
    expect(html).toMatch(/disabled=""[^>]*data-build-zip/);
    expect(html).toContain('помилка 404');
  });
});
