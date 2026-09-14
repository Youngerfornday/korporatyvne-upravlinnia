import { z } from 'zod';
import { KebabIdSchema, LawRefSchema, NonEmptyTextSchema, TopicIdSchema, findDuplicates, normalizeText } from '../primitives';

/** Рівень Блума експортується в Moodle як тег питання (випадковий вибір з фільтром за тегом). */
export const BloomLevelSchema = z.enum(['remember', 'understand', 'apply', 'analyze']);
export type BloomLevel = z.infer<typeof BloomLevelSchema>;

/** Варіанти оцінки Moodle у відсотках (question_bank::fraction_options_full), зі знаком для штрафів. */
export const MOODLE_GRADE_PERCENTS: readonly number[] = [
  100, 90, 83.33333, 80, 75, 70, 66.66667, 60, 50, 40, 33.33333, 30, 25, 20, 16.66667, 14.28571, 12.5, 11.11111, 10, 5, 0,
];
const GRADE_TOLERANCE = 0.001;
export const FULL_CREDIT = 100;
const SUM_TOLERANCE = 0.01;

export const FractionSchema = z
  .number()
  .min(-FULL_CREDIT)
  .max(FULL_CREDIT)
  .refine((value) => MOODLE_GRADE_PERCENTS.some((grade) => Math.abs(Math.abs(value) - grade) < GRADE_TOLERANCE), {
    message: `Оцінка варіанта має бути одним зі значень Moodle (±): ${MOODLE_GRADE_PERCENTS.join(', ')}`,
  });

export const FeedbackSchema = NonEmptyTextSchema;

/** Спільні поля всіх типів. `id` починається з ID теми: t04-q001. */
export const questionBaseShape = {
  id: KebabIdSchema,
  topic: TopicIdSchema,
  bloom: BloomLevelSchema,
  stem: NonEmptyTextSchema,
  generalFeedback: NonEmptyTextSchema,
  lawRef: z.array(LawRefSchema).default([]),
  defaultMark: z.number().positive().default(1),
};

export type IssueContext = { addIssue: (issue: { code: 'custom'; message: string; path?: PropertyKey[] }) => void };

export function reportIdPrefix(question: { id: string; topic: string }, ctx: IssueContext): void {
  if (!question.id.startsWith(`${question.topic}-`)) {
    ctx.addIssue({ code: 'custom', message: `ID питання має починатися з «${question.topic}-»`, path: ['id'] });
  }
}

export function reportDuplicateTexts(texts: readonly string[], label: string, path: PropertyKey[], ctx: IssueContext): void {
  for (const duplicate of findDuplicates(texts.map(normalizeText))) {
    ctx.addIssue({ code: 'custom', message: `${label} повторюються: «${duplicate}»`, path });
  }
}

export function reportMissingFullCredit(fractions: readonly number[], path: PropertyKey[], ctx: IssueContext): void {
  if (!fractions.some((fraction) => Math.abs(fraction - FULL_CREDIT) < GRADE_TOLERANCE)) {
    ctx.addIssue({ code: 'custom', message: 'Потрібна хоча б одна відповідь з оцінкою 100%', path });
  }
}

export function isFullCredit(fraction: number): boolean {
  return Math.abs(fraction - FULL_CREDIT) < GRADE_TOLERANCE;
}

export function positiveSumIsFull(fractions: readonly number[]): boolean {
  const sum = fractions.filter((fraction) => fraction > 0).reduce((acc, fraction) => acc + fraction, 0);
  return Math.abs(sum - FULL_CREDIT) < SUM_TOLERANCE;
}

export const TextAnswerSchema = z.object({ text: NonEmptyTextSchema, fraction: FractionSchema, feedback: FeedbackSchema });
export const NumericAnswerSchema = z.object({
  value: z.number(),
  tolerance: z.number().min(0).default(0),
  fraction: FractionSchema,
  feedback: FeedbackSchema,
});
