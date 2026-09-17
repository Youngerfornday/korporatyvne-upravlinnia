import type { FileChild } from 'docx';
import type { Course } from '../../../src/content/schemas/course.ts';
import { TABLE_SIZE, cellLines, formatNumber, list, para, spacer, table, type Cell, type CellContent } from './blocks.ts';
import { moduleNumber, outcomeCodes, topicLabels, topicNumber, type DocContext } from './context.ts';

/** Обсяг і структура дисципліни, тематичні плани лекцій і практичних, самостійна робота. */

export interface HoursRow {
  readonly lectures: number;
  readonly practicals: number;
  readonly selfStudy: number;
  readonly total: number;
}

export interface TopicHours extends HoursRow {
  readonly id: string;
  readonly number: number;
  readonly title: string;
}

export interface ModuleHours extends HoursRow {
  readonly id: string;
  readonly number: number;
  readonly title: string;
  readonly topics: readonly TopicHours[];
}

export interface HoursPlan {
  readonly modules: readonly ModuleHours[];
  readonly totals: HoursRow;
}

function sumRows(rows: readonly HoursRow[]): HoursRow {
  const lectures = rows.reduce((sum, row) => sum + row.lectures, 0);
  const practicals = rows.reduce((sum, row) => sum + row.practicals, 0);
  const selfStudy = rows.reduce((sum, row) => sum + row.selfStudy, 0);
  return { lectures, practicals, selfStudy, total: lectures + practicals + selfStudy };
}

/** Години практичної роботи зараховуються її основній (першій) темі. */
export function planHours(course: Course): HoursPlan {
  const topics = course.topics.map((topic, index): TopicHours => {
    const practicals = course.practicals.filter((practical) => practical.topics[0] === topic.id).reduce((sum, practical) => sum + practical.hours, 0);
    const { lectures, selfStudy } = topic.hours;
    return { id: topic.id, number: index + 1, title: topic.title, lectures, practicals, selfStudy, total: lectures + practicals + selfStudy };
  });
  const modules = course.modules.map((module, index): ModuleHours => {
    const moduleTopics = topics.filter((topic) => course.topics[topic.number - 1]?.module === module.id);
    return { id: module.id, number: index + 1, title: module.title, topics: moduleTopics, ...sumRows(moduleTopics) };
  });
  return { modules, totals: sumRows(modules) };
}

function hoursCells(row: HoursRow, bold = false): Cell[] {
  return [row.total, row.lectures, row.practicals, row.selfStudy].map((value) => ({ content: formatNumber(value), bold, align: 'center' as const }));
}

const HOURS_COLUMNS = [
  { header: 'Назва модуля і теми', share: 52 },
  { header: 'Усього', share: 12, align: 'center' as const },
  { header: 'Лекції', share: 12, align: 'center' as const },
  { header: 'Практичні', share: 12, align: 'center' as const },
  { header: 'СРС', share: 12, align: 'center' as const },
];

export function hoursTable(ctx: DocContext): FileChild[] {
  const plan = planHours(ctx.course);
  const rows = plan.modules.flatMap((module) => [
    [{ content: `Модуль ${module.number}. ${module.title}`, bold: true, span: HOURS_COLUMNS.length, shaded: true }],
    ...module.topics.map((topic) => [`Тема ${topic.number}. ${topic.title}`, ...hoursCells(topic)]),
    [{ content: `Разом за модулем ${module.number}`, bold: true }, ...hoursCells(module, true)],
  ]);
  return [
    table(HOURS_COLUMNS, [...rows, [{ content: 'Усього годин', bold: true }, ...hoursCells(plan.totals, true)]]),
    para('Години практичної роботи наведено в рядку її основної теми; СРС — самостійна робота студента.', { size: TABLE_SIZE, indent: false }),
  ];
}

export function lecturePlanTable(ctx: DocContext): FileChild[] {
  const { course } = ctx;
  const rows = course.topics.map((topic, index): CellContent[] => [
    formatNumber(index + 1),
    cellLines(`Тема ${index + 1}. ${topic.title}`, topic.lectureQuestions.map((question, q) => `${q + 1}) ${question}`)),
    formatNumber(topic.hours.lectures),
  ]);
  const total = course.topics.reduce((sum, topic) => sum + topic.hours.lectures, 0);
  return [
    table(
      [
        { header: '№', share: 6, align: 'center' },
        { header: 'Тема лекції та основні питання', share: 82 },
        { header: 'Год.', share: 12, align: 'center' },
      ],
      [...rows, [{ content: 'Разом', bold: true, span: 2 }, { content: formatNumber(total), bold: true }]],
    ),
    spacer(),
  ];
}

export function practicalPlanTable(ctx: DocContext): FileChild[] {
  const { course } = ctx;
  const rows = course.practicals.map((practical, index): CellContent[] => [
    formatNumber(index + 1),
    practical.title,
    topicLabels(course, practical.topics),
    outcomeCodes(course, practical.prn),
    formatNumber(practical.hours),
  ]);
  const total = course.practicals.reduce((sum, practical) => sum + practical.hours, 0);
  return [
    table(
      [
        { header: '№', share: 6, align: 'center' },
        { header: 'Тема практичної роботи', share: 50 },
        { header: 'Теми курсу', share: 14, align: 'center' },
        { header: 'ПРН', share: 20, align: 'center' },
        { header: 'Год.', share: 10, align: 'center' },
      ],
      [...rows, [{ content: 'Разом', bold: true, span: 4 }, { content: formatNumber(total), bold: true }]],
    ),
    spacer(),
  ];
}

/** Мета, результати й завдання кожної практичної роботи (для робочої програми). */
export function practicalDetails(ctx: DocContext): FileChild[] {
  return ctx.course.practicals.flatMap((practical, index) => [
    para(`Практична робота ${index + 1}. ${practical.title}`, { bold: true, indent: false, keepNext: true }),
    para([{ text: 'Мета: ', italics: true }, practical.goal]),
    para([{ text: 'Результати: ', italics: true }], { keepNext: true }),
    ...list(practical.results, 'bullets'),
    para([{ text: 'Завдання: ', italics: true }], { keepNext: true }),
    ...list(practical.tasks, 'numbered', ctx.nextListInstance()),
  ]);
}

export function selfStudyTable(ctx: DocContext): FileChild[] {
  const { course } = ctx;
  const rows = course.topics.flatMap((topic) =>
    topic.selfStudyTasks.map((task, index): CellContent[] => [
      index === 0 ? `Тема ${topicNumber(course, topic.id)}` : '',
      task.task,
      formatNumber(task.hours),
    ]),
  );
  const total = course.topics.reduce((sum, topic) => sum + topic.hours.selfStudy, 0);
  return [
    table(
      [
        { header: 'Тема', share: 14, align: 'center' },
        { header: 'Завдання самостійної роботи', share: 74 },
        { header: 'Год.', share: 12, align: 'center' },
      ],
      [...rows, [{ content: 'Разом', bold: true, span: 2 }, { content: formatNumber(total), bold: true }]],
    ),
    spacer(),
  ];
}

/** Зміст тем за модулями: анотація, результати навчання з кодами ПРН (для силабусу). */
export function topicOverview(ctx: DocContext): FileChild[] {
  const { course } = ctx;
  return course.modules.flatMap((module) => [
    para(`Модуль ${moduleNumber(course, module.id)}. ${module.title}`, { bold: true, indent: false, keepNext: true }),
    ...course.topics
      .filter((topic) => topic.module === module.id)
      .flatMap((topic) => [
        para([{ text: `Тема ${topicNumber(course, topic.id)}. ${topic.title}. `, bold: true }, topic.summary]),
        ...list(
          topic.results.map((result) => `${result.statement} (${outcomeCodes(course, result.prn)})`),
          'bullets',
        ),
      ]),
  ]);
}
