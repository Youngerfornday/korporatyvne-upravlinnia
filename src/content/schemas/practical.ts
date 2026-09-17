import { z } from 'zod';
import { PracticalIdSchema } from './course-shared';
import {
  CheckedAtSchema,
  HttpUrlSchema,
  IsoDateSchema,
  KebabIdSchema,
  NonEmptyTextSchema,
  findDuplicates,
  normalizeText,
  uniqueArray,
} from './primitives';
import { SourceSchema } from './sources';

/**
 * Файл `content/practicals/pNN.yaml` — дані тренажера практичної роботи.
 * Реєстр практичних (мета, результати, рубрика, ПРН) живе в course.yaml; тут — лише зміст тренажера.
 * Перший тренажер — матриця моделей корпоративного управління (`kind: model-matrix`).
 */

const MIN_MODELS = 2;
const MIN_FEATURES = 10;
const MIN_ESSAY_WORDS = 100;

/** Перевірений приклад компанії для моделі: з посиланням на джерело й датою перевірки. */
export const CompanyExampleSchema = z.object({
  company: NonEmptyTextSchema,
  country: NonEmptyTextSchema,
  note: NonEmptyTextSchema,
  url: HttpUrlSchema,
  checkedAt: CheckedAtSchema,
});

/** Стовпець матриці — модель корпоративного управління. */
export const MatrixModelSchema = z.object({
  id: KebabIdSchema,
  title: NonEmptyTextSchema,
  /** Коротка назва для вузьких екранів і заголовків стовпців. */
  short: NonEmptyTextSchema,
  /** ID терміна глосарію з реєстру course.yaml (наприклад, anglo-american-model). */
  term: KebabIdSchema.optional(),
  countries: z.array(NonEmptyTextSchema).min(1),
  summary: NonEmptyTextSchema,
  examples: z.array(CompanyExampleSchema).min(1),
});

/** Клітинка матриці: як ознака проявляється в моделі, чому саме так і звідки це відомо. */
export const MatrixCellSchema = z.object({
  model: KebabIdSchema,
  /** Формулювання, яке студент зіставляє з моделлю (показується в тренажері як картка). */
  statement: NonEmptyTextSchema,
  explanation: NonEmptyTextSchema,
  /** ID джерела з розділу sources цього файлу. */
  source: KebabIdSchema,
  /** Додаткові джерела клітинки (наприклад, другий закон для того самого правила). */
  alsoSources: uniqueArray(KebabIdSchema, 'Додаткові джерела').default([]),
});

/** Рядок матриці — ознака моделі. */
export const MatrixFeatureSchema = z
  .object({
    id: KebabIdSchema,
    title: NonEmptyTextSchema,
    cells: z.array(MatrixCellSchema).min(MIN_MODELS),
  })
  .superRefine((feature, ctx) => {
    for (const model of findDuplicates(feature.cells.map((cell) => cell.model))) {
      ctx.addIssue({ code: 'custom', message: `Ознака «${feature.id}»: модель «${model}» описана двічі`, path: ['cells'] });
    }
    for (const statement of findDuplicates(feature.cells.map((cell) => normalizeText(cell.statement)))) {
      ctx.addIssue({ code: 'custom', message: `Ознака «${feature.id}»: однакові формулювання «${statement}» для різних моделей`, path: ['cells'] });
    }
  });

/** Завдання «визнач модель за описом компанії». */
export const CompanyTaskSchema = z.object({
  id: KebabIdSchema,
  company: NonEmptyTextSchema,
  description: NonEmptyTextSchema,
  /** Правильна модель (ID зі стовпців). */
  answer: KebabIdSchema,
  /** Ознаки (ID рядків), які видають модель; студент має назвати щонайменше дві. */
  keyFeatures: uniqueArray(KebabIdSchema, 'Ключові ознаки').min(2),
  explanation: NonEmptyTextSchema,
  source: KebabIdSchema,
});

export const EssayTaskSchema = z.object({
  prompt: NonEmptyTextSchema,
  maxWords: z.int().min(MIN_ESSAY_WORDS),
  /** Що має бути в есе, щоб отримати вищий рівень за рубрикою course.yaml. */
  expectations: z.array(NonEmptyTextSchema).min(2),
  /** Підказки для розбору: на які розділи Принципів G20/ОЕСР 2023 і норми спиратися. */
  hints: z.array(NonEmptyTextSchema).default([]),
});

export const ModelMatrixSchema = z.object({
  kind: z.literal('model-matrix'),
  models: z.array(MatrixModelSchema).min(MIN_MODELS),
  features: z.array(MatrixFeatureSchema).min(MIN_FEATURES),
  companyTasks: z.array(CompanyTaskSchema).min(1),
  essay: EssayTaskSchema,
});

type ModelMatrix = z.infer<typeof ModelMatrixSchema>;
type Issue = { message: string; path: PropertyKey[] };

/** Повнота матриці: кожна ознака описана для кожної моделі, без зайвих і невідомих моделей. */
export function matrixIssues(matrix: ModelMatrix): Issue[] {
  const modelIds = matrix.models.map((model) => model.id);
  const featureIds = new Set(matrix.features.map((feature) => feature.id));
  const modelSet = new Set(modelIds);
  const featureIssues = matrix.features.flatMap((feature, index): Issue[] => {
    const described = new Set(feature.cells.map((cell) => cell.model));
    const missing = modelIds.filter((id) => !described.has(id));
    const unknown = feature.cells.map((cell) => cell.model).filter((id) => !modelSet.has(id));
    return [
      ...missing.map((id) => ({ message: `Ознака «${feature.id}»: немає клітинки для моделі «${id}»`, path: ['features', index, 'cells'] })),
      ...unknown.map((id) => ({ message: `Ознака «${feature.id}»: невідома модель «${id}»`, path: ['features', index, 'cells'] })),
    ];
  });
  const taskIssues = matrix.companyTasks.flatMap((task, index): Issue[] => [
    ...(modelSet.has(task.answer) ? [] : [{ message: `Завдання «${task.id}»: невідома модель «${task.answer}»`, path: ['companyTasks', index, 'answer'] }]),
    ...task.keyFeatures
      .filter((id) => !featureIds.has(id))
      .map((id) => ({ message: `Завдання «${task.id}»: невідома ознака «${id}»`, path: ['companyTasks', index, 'keyFeatures'] })),
  ]);
  return [
    ...findDuplicates(modelIds).map((id) => ({ message: `Дублікат ID моделі «${id}»`, path: ['models'] })),
    ...findDuplicates([...matrix.features.map((feature) => feature.id)]).map((id) => ({ message: `Дублікат ID ознаки «${id}»`, path: ['features'] })),
    ...findDuplicates(matrix.companyTasks.map((task) => task.id)).map((id) => ({ message: `Дублікат ID завдання «${id}»`, path: ['companyTasks'] })),
    ...featureIssues,
    ...taskIssues,
  ];
}

/** Усі посилання на джерела (клітинки, завдання) ведуть на розділ sources файлу. */
export function sourceRefIssues(matrix: ModelMatrix, sourceIds: ReadonlySet<string>): Issue[] {
  const cellRefs = matrix.features.flatMap((feature, f) =>
    feature.cells.flatMap((cell, c): Issue[] =>
      [cell.source, ...cell.alsoSources]
        .filter((id) => !sourceIds.has(id))
        .map((id) => ({ message: `Ознака «${feature.id}», модель «${cell.model}»: джерело «${id}» не описано`, path: ['features', f, 'cells', c, 'source'] })),
    ),
  );
  const taskRefs = matrix.companyTasks.flatMap((task, index): Issue[] =>
    sourceIds.has(task.source) ? [] : [{ message: `Завдання «${task.id}»: джерело «${task.source}» не описано`, path: ['companyTasks', index, 'source'] }],
  );
  return [...cellRefs, ...taskRefs];
}

export const PracticalFileSchema = z
  .object({
    id: PracticalIdSchema,
    title: NonEmptyTextSchema,
    /** Вступ до тренажера: що робити і як зараховується. */
    intro: NonEmptyTextSchema,
    status: z.enum(['draft', 'review', 'verified']).default('draft'),
    updatedAt: IsoDateSchema,
    sources: z.array(SourceSchema).min(1),
    trainer: ModelMatrixSchema,
  })
  .superRefine((file, ctx) => {
    for (const id of findDuplicates(file.sources.map((source) => source.id))) {
      ctx.addIssue({ code: 'custom', message: `Дублікат ID джерела «${id}»`, path: ['sources'] });
    }
    const sourceIds = new Set(file.sources.map((source) => source.id));
    for (const issue of [...matrixIssues(file.trainer), ...sourceRefIssues(file.trainer, sourceIds)]) {
      ctx.addIssue({ code: 'custom', message: issue.message, path: ['trainer', ...issue.path] });
    }
  });

export type PracticalFile = z.infer<typeof PracticalFileSchema>;
export type MatrixModel = z.infer<typeof MatrixModelSchema>;
export type MatrixFeature = z.infer<typeof MatrixFeatureSchema>;
export type MatrixCell = z.infer<typeof MatrixCellSchema>;
export type CompanyTask = z.infer<typeof CompanyTaskSchema>;

/** Кількість клітинок матриці — число «зіставлень» для рубрики (90 % / 60 %). */
export function matrixCellCount(matrix: ModelMatrix): number {
  return matrix.features.reduce((total, feature) => total + feature.cells.length, 0);
}
