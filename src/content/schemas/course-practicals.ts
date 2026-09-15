import { z } from 'zod';
import { PracticalIdSchema, ResearchRefSchema, type Report } from './course-shared';
import {
  HttpUrlSchema,
  KebabIdSchema,
  LearningOutcomeIdSchema,
  ModuleIdSchema,
  NonEmptyTextSchema,
  TopicIdSchema,
  findDuplicates,
  normalizeText,
  uniqueArray,
} from './primitives';

/** Рубрики (формат Moodle gradingform_rubric) і реєстр практичних робіт. */

const RubricLevelSchema = z.object({ points: z.number().min(0), description: NonEmptyTextSchema });

const rubricCriterionShape = {
  title: NonEmptyTextSchema,
  points: z.number().positive(),
  levels: z.array(RubricLevelSchema).min(2),
};

type CriterionDraft = { title: string; points: number; levels: ReadonlyArray<{ points: number; description: string }> };

/** Рівні критерію: від 0 до балів критерію, без повторів; найвищий рівень дорівнює балам критерію. */
function checkCriterionLevels(criterion: CriterionDraft, report: Report): void {
  const points = criterion.levels.map((level) => level.points);
  const label = `Критерій «${criterion.title}»`;
  if (Math.max(...points) !== criterion.points) {
    report(`${label}: найвищий рівень має дорівнювати балам критерію (${criterion.points})`, ['levels']);
  }
  if (!points.includes(0)) report(`${label}: потрібен рівень на 0 балів`, ['levels']);
  if (points.some((value) => value > criterion.points)) report(`${label}: рівень перевищує бали критерію`, ['levels']);
  if (findDuplicates(points.map(String)).length > 0) report(`${label}: бали рівнів повторюються`, ['levels']);
  if (findDuplicates(criterion.levels.map((level) => normalizeText(level.description))).length > 0) {
    report(`${label}: описи рівнів повторюються`, ['levels']);
  }
}

function withCriterionChecks<T extends z.ZodType<CriterionDraft>>(schema: T): T {
  return schema.superRefine((criterion, ctx) =>
    checkCriterionLevels(criterion, (message, path) => ctx.addIssue({ code: 'custom', message, path })),
  ) as T;
}

/** Moodle вимагає унікальних назв критеріїв у межах рубрики. */
function rubricOf<T extends z.ZodType<CriterionDraft>>(criterion: T) {
  return z
    .array(criterion)
    .min(1)
    .superRefine((criteria, ctx) => {
      for (const title of findDuplicates(criteria.map((c) => normalizeText(c.title)))) {
        ctx.addIssue({ code: 'custom', message: `Назви критеріїв рубрики повторюються: «${title}»` });
      }
    });
}

export const RubricSchema = rubricOf(withCriterionChecks(z.object(rubricCriterionShape)));

export const CaseProjectRubricSchema = rubricOf(withCriterionChecks(z.object({ ...rubricCriterionShape, stage: KebabIdSchema })));

const PracticalDataSchema = z.object({
  title: NonEmptyTextSchema,
  ref: ResearchRefSchema,
  url: HttpUrlSchema,
  note: NonEmptyTextSchema.optional(),
});

export const PracticalSchema = z.object({
  id: PracticalIdSchema,
  module: ModuleIdSchema,
  /** Перша тема — основна: її модуль збігається з модулем практичної. */
  topics: uniqueArray(TopicIdSchema, 'Теми практичної').min(1),
  title: NonEmptyTextSchema,
  hours: z.int().positive(),
  goal: NonEmptyTextSchema,
  results: z.array(NonEmptyTextSchema).min(2),
  prn: uniqueArray(LearningOutcomeIdSchema, 'ПРН практичної').min(1),
  /** ID рушіїв тренажерів (src/engines); самі рушії пише окремий потік. */
  trainers: uniqueArray(KebabIdSchema, 'Тренажери практичної').min(1),
  tasks: z.array(NonEmptyTextSchema).min(2),
  rubric: RubricSchema,
  data: z.array(PracticalDataSchema).min(1),
});

export function rubricTotal(criteria: ReadonlyArray<{ points: number }>): number {
  return criteria.reduce((total, criterion) => total + criterion.points, 0);
}
