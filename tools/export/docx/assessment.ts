import type { FileChild } from 'docx';
import type { Course } from '../../../src/content/schemas/course.ts';
import { formatNumber, list, para, spacer, table, type Cell, type CellContent, type DocSection } from './blocks.ts';
import { topicNumber, type DocContext } from './context.ts';

/** Оцінювання: розподіл балів, тести, кейс-проєкт, рубрики, допуск, додаткові бали, шкала. */

export const BLOOM_LEVELS = [
  { key: 'remember', label: 'Запам’ятовування' },
  { key: 'understand', label: 'Розуміння' },
  { key: 'apply', label: 'Застосування' },
  { key: 'analyze', label: 'Аналіз' },
] as const;

const STAGE_LABEL = { current: 'Поточний контроль', final: 'Підсумковий контроль' } as const;

type Grading = Course['grading'];
type RubricCriterion = { readonly title: string; readonly points: number; readonly levels: ReadonlyArray<{ readonly points: number; readonly description: string }> };

export interface PointsRow {
  readonly title: string;
  readonly items: number;
  readonly pointsPerItem: number;
  readonly max: number;
}

export interface PointsPlan {
  readonly stages: ReadonlyArray<{ readonly stage: 'current' | 'final'; readonly rows: readonly PointsRow[]; readonly max: number }>;
  readonly total: number;
}

export function planPoints(grading: Grading): PointsPlan {
  const stages = (['current', 'final'] as const).map((stage) => {
    const rows = grading.categories
      .filter((category) => category.stage === stage)
      .map((category) => ({ title: category.title, items: category.items, pointsPerItem: category.pointsPerItem, max: category.items * category.pointsPerItem }));
    return { stage, rows, max: rows.reduce((sum, row) => sum + row.max, 0) };
  });
  return { stages, total: stages.reduce((sum, stage) => sum + stage.max, 0) };
}

export function regulationRef(course: Course, ref: { readonly regulation: string; readonly clause: string }): string {
  const regulation = course.regulations.find((candidate) => candidate.id === ref.regulation);
  return `${regulation?.title ?? ref.regulation}, ${ref.clause}`;
}

function pointsTable(ctx: DocContext): FileChild[] {
  const plan = planPoints(ctx.course.grading);
  const bold = (content: string): Cell => ({ content, bold: true, align: 'center' });
  const rows = plan.stages.flatMap((stage): Array<ReadonlyArray<Cell | CellContent>> => [
    [{ content: STAGE_LABEL[stage.stage], bold: true, span: 3, shaded: true }, { ...bold(formatNumber(stage.max)), shaded: true }],
    ...stage.rows.map((row) => [row.title, formatNumber(row.items), formatNumber(row.pointsPerItem), formatNumber(row.max)]),
  ]);
  return [
    table(
      [
        { header: 'Вид роботи', share: 52 },
        { header: 'Кількість', share: 16, align: 'center' },
        { header: 'Балів за одиницю', share: 16, align: 'center' },
        { header: 'Максимум балів', share: 16, align: 'center' },
      ],
      [...rows, [{ content: 'Разом', bold: true, span: 3 }, bold(formatNumber(plan.total))]],
    ),
    spacer(),
  ];
}

function testsChildren(ctx: DocContext): FileChild[] {
  const { moduleTests, finalTest } = ctx.course.grading;
  const bloom = BLOOM_LEVELS.map((level) => `${level.label.toLocaleLowerCase('uk-UA')} — ${moduleTests.bloom[level.key]}`).join(', ');
  const matrixRows = finalTest.matrix.map((row): CellContent[] => [
    `Тема ${topicNumber(ctx.course, row.topic)}`,
    ...BLOOM_LEVELS.map((level) => formatNumber(row[level.key])),
    formatNumber(BLOOM_LEVELS.reduce((sum, level) => sum + row[level.key], 0)),
  ]);
  const levelTotals = BLOOM_LEVELS.map((level) => finalTest.matrix.reduce((sum, row) => sum + row[level.key], 0));
  return [
    para(
      `Модульний тест (після кожного модуля) — ${moduleTests.questions} випадкових питань з банку модуля (${moduleTests.bankPerModule} питань), ` +
        `${moduleTests.timeLimitMinutes} хв, спроб — ${moduleTests.attempts}. Розподіл за рівнями Блума: ${bloom}.`,
    ),
    para(
      `Підсумковий тест — ${finalTest.questions} питань з банку на ${finalTest.bankSize} питань, ${finalTest.timeLimitMinutes} хв, спроб — ${finalTest.attempts}. ` +
        'Питання добираються за матрицею «теми × рівні Блума»:',
      { keepNext: true },
    ),
    table(
      [
        { header: 'Тема', share: 20, align: 'center' },
        ...BLOOM_LEVELS.map((level) => ({ header: level.label, share: 16, align: 'center' as const })),
        { header: 'Усього', share: 16, align: 'center' },
      ],
      [
        ...matrixRows,
        [
          { content: 'Разом', bold: true },
          ...levelTotals.map((value) => ({ content: formatNumber(value), bold: true })),
          { content: formatNumber(levelTotals.reduce((sum, value) => sum + value, 0)), bold: true },
        ],
      ],
    ),
    spacer(),
  ];
}

/** Рубрика: критерій і бали, далі рівні з описами. */
export function rubricTable<T extends RubricCriterion>(criteria: readonly T[], stageTitle?: (criterion: T) => string): FileChild[] {
  const rows = criteria.flatMap((criterion): Array<ReadonlyArray<Cell | CellContent>> => [
    [
      { content: stageTitle ? `${criterion.title} (${stageTitle(criterion)})` : criterion.title, bold: true, span: 2 },
      { content: formatNumber(criterion.points), bold: true, align: 'center' },
    ],
    ...criterion.levels.map((level) => ['', level.description, formatNumber(level.points)]),
  ]);
  const total = criteria.reduce((sum, criterion) => sum + criterion.points, 0);
  return [
    table(
      [
        { header: '', share: 4 },
        { header: 'Критерій і рівні виконання', share: 82 },
        { header: 'Бали', share: 14, align: 'center' },
      ],
      [...rows, [{ content: 'Максимум за рубрикою', bold: true, span: 2 }, { content: formatNumber(total), bold: true, align: 'center' }]],
    ),
    spacer(),
  ];
}

function caseProjectChildren(ctx: DocContext): FileChild[] {
  const { caseProject } = ctx.course.grading;
  const stageTitle = (criterion: { readonly stage: string }): string => caseProject.stages.find((stage) => stage.id === criterion.stage)?.title ?? criterion.stage;
  return [
    para([{ text: `«${caseProject.title}». `, bold: true }, caseProject.goal]),
    para('Вимоги до компанії:', { keepNext: true }),
    ...list(caseProject.companyCriteria, 'bullets'),
    table(
      [
        { header: 'Етап', share: 30 },
        { header: 'Результат етапу', share: 70 },
      ],
      caseProject.stages.map((stage) => [stage.title, stage.deliverable]),
    ),
    spacer(),
    para('Критерії оцінювання кейс-проєкту:', { keepNext: true }),
    ...rubricTable(caseProject.rubric, stageTitle),
  ];
}

function practicalRubrics(ctx: DocContext): FileChild[] {
  return ctx.course.practicals.flatMap((practical, index) => [
    para(`Практична робота ${index + 1}. ${practical.title}`, { bold: true, indent: false, keepNext: true }),
    ...rubricTable(practical.rubric),
  ]);
}

function admissionChildren(ctx: DocContext): FileChild[] {
  const { course } = ctx;
  const { admission, bonus } = course.grading;
  return [
    para(`До підсумкового контролю допускається здобувач, який набрав щонайменше ${formatNumber(admission.minCurrentPoints)} балів поточного контролю і виконав умови:`, {
      keepNext: true,
    }),
    ...list(admission.conditions, 'bullets'),
    para(admission.currentScoreOption),
    para(`Підстава: ${admission.basis.map((ref) => regulationRef(course, ref)).join('; ')}.`),
    para(`Додаткові бали (разом не більше ${formatNumber(bonus.maxPoints)}):`, { keepNext: true }),
    ...list(
      bonus.activities.map((activity) => `${activity.title} — до ${formatNumber(activity.maxPoints)} б.`),
      'bullets',
    ),
    para(bonus.rule),
  ];
}

function scaleChildren(ctx: DocContext): FileChild[] {
  const { course } = ctx;
  return [
    table(
      [
        { header: 'Сума балів', share: 22, align: 'center' },
        { header: 'Оцінка ECTS', share: 22, align: 'center' },
        { header: 'Оцінка за національною шкалою', share: 56 },
      ],
      course.scale.map((band) => [`${band.min}–${band.max}`, band.ects, band.national]),
    ),
    para(`Підстава: ${regulationRef(course, course.grading.scaleBasis)}.`),
  ];
}

export function assessmentSection(ctx: DocContext, options: { readonly rubrics: boolean }): DocSection {
  const { split } = ctx.course.grading;
  const base = [
    {
      title: 'Розподіл балів',
      children: [para(`Максимальна оцінка — 100 балів: поточний контроль — ${formatNumber(split.current)}, підсумковий — ${formatNumber(split.final)}.`), ...pointsTable(ctx)],
    },
    { title: 'Модульні та підсумковий тести', children: testsChildren(ctx) },
    { title: 'Кейс-проєкт', children: caseProjectChildren(ctx) },
  ];
  const rubrics = options.rubrics ? [{ title: 'Критерії оцінювання практичних робіт', children: practicalRubrics(ctx) }] : [];
  return {
    title: 'Оцінювання результатів навчання',
    subsections: [
      ...base,
      ...rubrics,
      { title: 'Допуск до підсумкового контролю і додаткові бали', children: admissionChildren(ctx) },
      { title: 'Шкала оцінювання', children: scaleChildren(ctx) },
    ],
  };
}
