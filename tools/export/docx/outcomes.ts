import type { FileChild } from 'docx';
import type { DocSection } from './blocks.ts';
import { list, para, spacer, table, type CellContent } from './blocks.ts';
import { outcomeCodes, topicLabels, type DocContext } from './context.ts';

/** Компетентності й програмні результати навчання: таблиці й матриця відповідності ПРН темам. */

const SOURCE_LABEL = { standard: 'Стандарт', program: 'ОП університету' } as const;

function competencesTable(ctx: DocContext): FileChild[] {
  const { course } = ctx;
  const ordered = [...course.competences.filter((c) => c.kind === 'general'), ...course.competences.filter((c) => c.kind === 'special')];
  const rows = ordered.map((competence): CellContent[] => [
    competence.code,
    competence.statement,
    SOURCE_LABEL[competence.source],
    topicLabels(course, competence.topics),
  ]);
  return [
    table(
      [
        { header: 'Код', share: 10, align: 'center' },
        { header: 'Компетентність', share: 50 },
        { header: 'Джерело', share: 16, align: 'center' },
        { header: 'Теми', share: 24, align: 'center' },
      ],
      rows,
    ),
    spacer(),
  ];
}

function outcomesTable(ctx: DocContext): FileChild[] {
  const { course } = ctx;
  const rows = course.learningOutcomes.map((outcome): CellContent[] => [
    outcome.code,
    outcome.statement,
    topicLabels(course, outcome.topics),
    outcome.practicals.map((id) => `П${course.practicals.findIndex((p) => p.id === id) + 1}`).join(', '),
  ]);
  return [
    table(
      [
        { header: 'Код', share: 10, align: 'center' },
        { header: 'Програмний результат навчання', share: 50 },
        { header: 'Теми', share: 24, align: 'center' },
        { header: 'Практичні', share: 16, align: 'center' },
      ],
      rows,
    ),
    spacer(),
  ];
}

/** Матриця «ПРН × теми»: знак «+», якщо тема формує результат. */
export function outcomeMatrix(ctx: DocContext): FileChild[] {
  const { course } = ctx;
  const topicShare = 84 / course.topics.length;
  const columns = [
    { header: 'ПРН', share: 16, align: 'center' as const },
    ...course.topics.map((_, index) => ({ header: `Т${index + 1}`, share: topicShare, align: 'center' as const })),
  ];
  const rows = course.learningOutcomes.map((outcome): CellContent[] => [
    outcome.code,
    ...course.topics.map((topic) => (outcome.topics.includes(topic.id) ? '+' : '')),
  ]);
  return [table(columns, rows), spacer()];
}

function topicResults(ctx: DocContext): FileChild[] {
  const { course } = ctx;
  return course.topics.flatMap((topic, index) => [
    para(`Тема ${index + 1}. ${topic.title}`, { bold: true, indent: false, keepNext: true }),
    ...list(
      topic.results.map((result) => `${result.statement} (${outcomeCodes(course, result.prn)})`),
      'bullets',
    ),
  ]);
}

/** Силабус показує результати тем у змісті дисципліни, тому тут їх і матрицю вмикає лише робоча програма. */
export function outcomesSection(ctx: DocContext, options: { readonly detailed: boolean }): DocSection {
  const { course } = ctx;
  const { standard } = course.program;
  const base = [
    { title: 'Інтегральна компетентність', children: [para(course.integralCompetence.statement)] },
    {
      title: 'Загальні та спеціальні компетентності',
      children: [
        para(`Джерело кодів і формулювань: ${standard.title} (${standard.approval}); коди з позначкою «ОП університету» — з освітньої програми.`),
        ...competencesTable(ctx),
      ],
    },
    { title: 'Програмні результати навчання', children: outcomesTable(ctx) },
  ];
  const detailed = [
    { title: 'Результати навчання за темами', children: topicResults(ctx) },
    { title: 'Матриця відповідності ПРН темам', children: outcomeMatrix(ctx) },
  ];
  return { title: 'Компетентності та програмні результати навчання', subsections: options.detailed ? [...base, ...detailed] : base };
}
