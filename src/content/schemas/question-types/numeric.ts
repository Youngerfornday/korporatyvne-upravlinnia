import { z } from 'zod';
import { findDuplicates } from '../primitives';
import {
  FeedbackSchema,
  FractionSchema,
  NumericAnswerSchema,
  questionBaseShape,
  reportIdPrefix,
  reportMissingFullCredit,
  type IssueContext,
} from './shared';

const MAX_DECIMALS = 10;
const MAX_ANSWER_LENGTH = 9;
const MAX_DATASET_ITEMS = 100;
const DEFAULT_DATASET_ITEMS = 10;
/** «Calculated (±1%)» з плану курсу. */
const DEFAULT_RELATIVE_TOLERANCE = 0.01;

/** Moodle numerical: у YAML числа з крапкою; кома як десятковий знак — задача відображення й експорту. */
export const NumericalQuestionSchema = z
  .object({
    ...questionBaseShape,
    type: z.literal('numerical'),
    answers: z.array(NumericAnswerSchema).min(1),
  })
  .superRefine((question, ctx) => {
    reportIdPrefix(question, ctx);
    reportMissingFullCredit(question.answers.map((a) => a.fraction), ['answers'], ctx);
  });

const WILDCARD_PATTERN = /\{([A-Za-z_][A-Za-z0-9_]*)\}/g;

/** Функції, які приймає qtype_calculated (qtype_calculated_find_formula_errors). */
const MOODLE_FORMULA_FUNCTIONS = new Set([
  'abs', 'acos', 'acosh', 'asin', 'asinh', 'atan', 'atan2', 'atanh', 'bindec', 'ceil', 'cos', 'cosh', 'decbin',
  'decoct', 'deg2rad', 'exp', 'expm1', 'floor', 'fmod', 'is_finite', 'is_infinite', 'is_nan', 'log', 'log10',
  'log1p', 'max', 'min', 'octdec', 'pi', 'pow', 'rad2deg', 'round', 'sin', 'sinh', 'sqrt', 'tan', 'tanh',
]);

function wildcardsIn(text: string): string[] {
  return [...text.matchAll(WILDCARD_PATTERN)].map((match) => match[1] ?? '');
}

function formulaProblems(formula: string): string[] {
  const withoutWildcards = formula.replace(WILDCARD_PATTERN, '1');
  const unknownWords = [...withoutWildcards.matchAll(/[A-Za-z_][A-Za-z0-9_]*/g)]
    .map((match) => match[0])
    .filter((word) => !MOODLE_FORMULA_FUNCTIONS.has(word));
  const badCharacters = withoutWildcards.replace(/[A-Za-z0-9_.\s+\-*/%(),]/g, '');
  return [
    ...unknownWords.map((word) => `невідома функція або змінна «${word}»`),
    ...(badCharacters ? [`недопустимі символи «${badCharacters}»`] : []),
  ];
}

const DatasetSchema = z
  .object({
    name: z.string().regex(/^[A-Za-z_][A-Za-z0-9_]*$/),
    min: z.number(),
    max: z.number(),
    decimals: z.int().min(0).max(MAX_DECIMALS),
    distribution: z.enum(['uniform', 'loguniform']).default('uniform'),
  })
  .refine((dataset) => dataset.min <= dataset.max, { message: 'Набір даних: min має бути не більшим за max' })
  .refine((dataset) => dataset.distribution !== 'loguniform' || dataset.min > 0, {
    message: 'Набір даних: логарифмічний розподіл потребує min більшого за нуль',
  });

const CalculatedAnswerSchema = z.object({
  formula: z.string().trim().min(1),
  fraction: FractionSchema,
  tolerance: z.number().min(0).default(DEFAULT_RELATIVE_TOLERANCE),
  toleranceType: z.enum(['relative', 'nominal', 'geometric']).default('relative'),
  correctAnswerLength: z.int().min(0).max(MAX_ANSWER_LENGTH).default(2),
  correctAnswerFormat: z.enum(['decimals', 'significant-figures']).default('decimals'),
  feedback: FeedbackSchema,
});

function reportCalculatedWildcards(
  question: { stem: string; answers: ReadonlyArray<{ formula: string }>; datasets: ReadonlyArray<{ name: string }> },
  ctx: IssueContext,
): void {
  const names = question.datasets.map((d) => d.name);
  for (const duplicate of findDuplicates(names)) {
    ctx.addIssue({ code: 'custom', message: `Набір даних {${duplicate}} визначено двічі`, path: ['datasets'] });
  }
  const defined = new Set(names);
  const inFormulas = new Set(question.answers.flatMap((a) => wildcardsIn(a.formula)));
  for (const wildcard of new Set([...inFormulas, ...wildcardsIn(question.stem)])) {
    if (!defined.has(wildcard)) {
      ctx.addIssue({ code: 'custom', message: `Змінна {${wildcard}} не має набору даних`, path: ['datasets'] });
    }
  }
  for (const name of defined) {
    if (!inFormulas.has(name)) {
      ctx.addIssue({ code: 'custom', message: `Набір даних {${name}} не використано в жодній формулі`, path: ['datasets'] });
    }
  }
  question.answers.forEach((answer, index) => {
    for (const problem of formulaProblems(answer.formula)) {
      ctx.addIssue({ code: 'custom', message: `Формула «${answer.formula}»: ${problem}`, path: ['answers', index, 'formula'] });
    }
  });
}

/** Moodle calculated: формула з `{змінними}`, діапазони наборів даних, допуск (типово відносний ±1%). */
export const CalculatedQuestionSchema = z
  .object({
    ...questionBaseShape,
    type: z.literal('calculated'),
    answers: z.array(CalculatedAnswerSchema).min(1),
    datasets: z.array(DatasetSchema).min(1),
    itemCount: z.int().min(1).max(MAX_DATASET_ITEMS).default(DEFAULT_DATASET_ITEMS),
  })
  .superRefine((question, ctx) => {
    reportIdPrefix(question, ctx);
    reportMissingFullCredit(question.answers.map((a) => a.fraction), ['answers'], ctx);
    reportCalculatedWildcards(question, ctx);
  });
