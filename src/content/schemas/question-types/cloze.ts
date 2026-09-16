import { z } from 'zod';
import {
  NumericAnswerSchema,
  TextAnswerSchema,
  questionBaseShape,
  reportDuplicateTexts,
  reportIdPrefix,
  reportMissingFullCredit,
} from './shared';

const MIN_CHOICES = 2;
const weight = z.int().min(1).default(1);

const ClozeMultichoiceSchema = z.object({
  kind: z.literal('multichoice'),
  /** dropdown → MULTICHOICE, vertical → MULTICHOICE_V, horizontal → MULTICHOICE_H. */
  display: z.enum(['dropdown', 'vertical', 'horizontal']).default('dropdown'),
  shuffle: z.boolean().default(false),
  weight,
  answers: z.array(TextAnswerSchema).min(MIN_CHOICES),
});

const ClozeShortAnswerSchema = z.object({
  kind: z.literal('shortanswer'),
  caseSensitive: z.boolean().default(false),
  weight,
  answers: z.array(TextAnswerSchema).min(1),
});

const ClozeNumericalSchema = z.object({
  kind: z.literal('numerical'),
  weight,
  answers: z.array(NumericAnswerSchema).min(1),
});

const ClozeSubquestionSchema = z.discriminatedUnion('kind', [
  ClozeMultichoiceSchema,
  ClozeShortAnswerSchema,
  ClozeNumericalSchema,
]);

const PLACEHOLDER_PATTERN = /\{#(\d+)\}/g;

/** Бал Cloze Moodle рахує сам як суму ваг підпитань, тож `defaultMark` у файлі банку не задають. */
const { defaultMark: _defaultMark, ...multianswerBaseShape } = questionBaseShape;

/**
 * Moodle multianswer (Cloze). Стовбур містить `{#1}`, `{#2}` … — по одному на кожне підпитання в порядку списку.
 * Синтаксис `{1:MULTICHOICE:=…}` генерує експортер, тож екранування спецсимволів Cloze тут не потрібне.
 */
export const MultianswerQuestionSchema = z
  .object({
    ...multianswerBaseShape,
    type: z.literal('multianswer'),
    defaultMark: z
      .undefined({ error: 'Cloze не має поля defaultMark: бал дорівнює сумі ваг підпитань' })
      .optional(),
    subquestions: z.array(ClozeSubquestionSchema).min(1),
  })
  .superRefine((question, ctx) => {
    reportIdPrefix(question, ctx);
    const placeholders = [...question.stem.matchAll(PLACEHOLDER_PATTERN)].map((match) => Number(match[1]));
    const expected = question.subquestions.map((_, index) => index + 1);
    for (const number of expected) {
      const count = placeholders.filter((p) => p === number).length;
      if (count !== 1) {
        ctx.addIssue({ code: 'custom', message: `Мітка {#${number}} має бути в стовбурі рівно один раз`, path: ['stem'] });
      }
    }
    for (const number of new Set(placeholders)) {
      if (!expected.includes(number)) {
        ctx.addIssue({ code: 'custom', message: `Мітка {#${number}} не має відповідного підпитання`, path: ['stem'] });
      }
    }
    question.subquestions.forEach((subquestion, index) => {
      reportMissingFullCredit(subquestion.answers.map((a) => a.fraction), ['subquestions', index], ctx);
      if (subquestion.kind !== 'numerical') {
        reportDuplicateTexts(subquestion.answers.map((a) => a.text), 'Відповіді підпитання', ['subquestions', index], ctx);
      }
    });
  })
  // Бал питання = сума ваг підпитань (qtype_multianswer_extract_question): рушій тесту й експортер
  // читають його з того самого поля, що й в інших типах.
  .transform((question) => ({
    ...question,
    defaultMark: question.subquestions.reduce((sum, subquestion) => sum + subquestion.weight, 0),
  }));
