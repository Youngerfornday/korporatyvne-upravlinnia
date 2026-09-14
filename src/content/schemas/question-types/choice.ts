import { z } from 'zod';
import { NonEmptyTextSchema, normalizeText } from '../primitives';
import {
  FeedbackSchema,
  TextAnswerSchema,
  isFullCredit,
  positiveSumIsFull,
  questionBaseShape,
  reportDuplicateTexts,
  reportIdPrefix,
} from './shared';

const MIN_CHOICES = 2;
const MIN_MATCHING_ANSWERS = 3;
const MAX_DDWTOS_GROUPS = 8;

/** Moodle multichoice: `single` — один правильний; інакше частковий бал, додатні оцінки дають 100%. */
export const MultichoiceQuestionSchema = z
  .object({
    ...questionBaseShape,
    type: z.literal('multichoice'),
    single: z.boolean(),
    shuffleAnswers: z.boolean().default(true),
    answerNumbering: z.enum(['abc', 'ABCD', '123', 'none']).default('abc'),
    answers: z.array(TextAnswerSchema).min(MIN_CHOICES),
  })
  .superRefine((question, ctx) => {
    reportIdPrefix(question, ctx);
    reportDuplicateTexts(question.answers.map((a) => a.text), 'Варіанти відповіді', ['answers'], ctx);
    const fractions = question.answers.map((a) => a.fraction);
    if (question.single && fractions.filter(isFullCredit).length !== 1) {
      ctx.addIssue({ code: 'custom', message: 'В одиночному виборі має бути рівно одна відповідь зі 100%', path: ['answers'] });
    }
    if (!question.single && !positiveSumIsFull(fractions)) {
      ctx.addIssue({ code: 'custom', message: 'У множинному виборі додатні оцінки мають у сумі давати 100%', path: ['answers'] });
    }
  });

/** Moodle truefalse: відгук окремо для «Правда» і «Неправда». */
export const TrueFalseQuestionSchema = z
  .object({
    ...questionBaseShape,
    type: z.literal('truefalse'),
    correct: z.boolean(),
    feedbackTrue: FeedbackSchema,
    feedbackFalse: FeedbackSchema,
  })
  .superRefine(reportIdPrefix);

/** Moodle matching: пари «питання — відповідь» і дистрактори (відповіді без питання). */
export const MatchingQuestionSchema = z
  .object({
    ...questionBaseShape,
    type: z.literal('matching'),
    shuffleAnswers: z.boolean().default(true),
    pairs: z
      .array(z.object({ prompt: NonEmptyTextSchema, answer: NonEmptyTextSchema, feedback: FeedbackSchema }))
      .min(MIN_CHOICES),
    distractors: z.array(NonEmptyTextSchema).default([]),
  })
  .superRefine((question, ctx) => {
    reportIdPrefix(question, ctx);
    reportDuplicateTexts(question.pairs.map((p) => p.prompt), 'Елементи для зіставлення', ['pairs'], ctx);
    reportDuplicateTexts(question.distractors, 'Дистрактори', ['distractors'], ctx);
    const answers = new Set(question.pairs.map((p) => normalizeText(p.answer)));
    for (const distractor of question.distractors) {
      if (answers.has(normalizeText(distractor))) {
        ctx.addIssue({ code: 'custom', message: `Дистрактор «${distractor}» збігається з правильною відповіддю`, path: ['distractors'] });
      }
    }
    if (question.pairs.length + question.distractors.length < MIN_MATCHING_ANSWERS) {
      ctx.addIssue({ code: 'custom', message: 'Moodle вимагає щонайменше три відповіді (пари разом із дистракторами)', path: ['distractors'] });
    }
  });

const GAP_PATTERN = /\[\[(\d+)\]\]/g;

/** Moodle ddwtos: у стовбурі пропуски `[[n]]`, де n — номер правильного варіанта (з 1). */
export const DdwtosQuestionSchema = z
  .object({
    ...questionBaseShape,
    type: z.literal('ddwtos'),
    shuffleAnswers: z.boolean().default(true),
    choices: z
      .array(
        z.object({
          text: NonEmptyTextSchema,
          group: z.int().min(1).max(MAX_DDWTOS_GROUPS).default(1),
          infinite: z.boolean().default(false),
          feedback: FeedbackSchema,
        }),
      )
      .min(MIN_CHOICES),
  })
  .superRefine((question, ctx) => {
    reportIdPrefix(question, ctx);
    reportDuplicateTexts(
      question.choices.map((c) => `${c.group}:${c.text}`),
      'Варіанти в одній групі',
      ['choices'],
      ctx,
    );
    const gaps = [...question.stem.matchAll(GAP_PATTERN)].map((match) => Number(match[1]));
    if (gaps.length === 0) {
      ctx.addIssue({ code: 'custom', message: 'Стовбур має містити хоча б один пропуск [[1]]', path: ['stem'] });
    }
    for (const gap of new Set(gaps)) {
      const choice = question.choices[gap - 1];
      if (!choice) {
        ctx.addIssue({ code: 'custom', message: `Пропуск [[${gap}]] посилається на неіснуючий варіант`, path: ['stem'] });
      } else if (!choice.infinite && gaps.filter((g) => g === gap).length > 1) {
        ctx.addIssue({ code: 'custom', message: `Варіант [[${gap}]] використано кілька разів без infinite: true`, path: ['choices'] });
      }
    }
  });
