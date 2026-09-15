import { formatNumber } from '../shared/number-format';
import { gradeResponse } from './grading';
import { matchingChoices } from './grading/choice';
import { calculatedAnswerValues, numericalTargets } from './grading/numeric';
import {
  bestAnswerIndex,
  formatCalculatedAnswer,
  reviewClozeParts,
  reviewGaps,
  reviewMatchingItems,
  reviewMultichoiceOptions,
  reviewNumeric,
  reviewTrueFalseOptions,
  type ChoiceOptionReview,
  type ClozePartReview,
  type GapReview,
  type MatchingItemReview,
  type NumericReview,
  type TrueFalseOptionReview,
} from './review-parts';
import type { GradeResult, LayoutOf, Question, QuestionLayout, QuestionResponse, ResponseOf } from './types';

export type { ChoiceOptionReview, ClozePartReview, GapReview, MatchingItemReview, NumericReview, TrueFalseOptionReview };

interface ReviewBase {
  readonly grade: GradeResult;
  readonly generalFeedback: string;
}

/** Розбір відповіді для UI: пояснення до кожного варіанта, правильні відповіді, загальний відгук. */
export type QuestionReview =
  | (ReviewBase & { readonly type: 'multichoice'; readonly options: readonly ChoiceOptionReview[] })
  | (ReviewBase & { readonly type: 'truefalse'; readonly feedback: string | null; readonly options: readonly TrueFalseOptionReview[] })
  | (ReviewBase & { readonly type: 'matching'; readonly choices: readonly string[]; readonly items: readonly MatchingItemReview[] })
  | (ReviewBase & NumericReview & { readonly type: 'numerical' })
  | (ReviewBase & NumericReview & { readonly type: 'calculated'; readonly values: Readonly<Record<string, number>> })
  | (ReviewBase & {
      readonly type: 'ddwtos';
      readonly choices: readonly { readonly index: number; readonly text: string; readonly group: number }[];
      readonly gaps: readonly GapReview[];
    })
  | (ReviewBase & { readonly type: 'multianswer'; readonly parts: readonly ClozePartReview[] });

function assertLayout<T extends QuestionLayout['type']>(layout: QuestionLayout, type: T): asserts layout is LayoutOf<T> {
  if (layout.type !== type) throw new TypeError(`Розкладка ${layout.type} не відповідає питанню типу ${type}`);
}

/** Відповідь того самого типу, що й питання, або null. */
function responseOf<T extends Question['type']>(response: QuestionResponse | null, type: T): ResponseOf<T> | null {
  return response?.type === type ? (response as ResponseOf<T>) : null;
}

export function reviewQuestion(question: Question, layout: QuestionLayout, response: QuestionResponse | null): QuestionReview {
  assertLayout(layout, question.type);
  const base: ReviewBase = { grade: gradeResponse(question, layout, response), generalFeedback: question.generalFeedback };

  switch (question.type) {
    case 'multichoice': {
      const typedLayout = layout as LayoutOf<'multichoice'>;
      return { ...base, type: 'multichoice', options: reviewMultichoiceOptions(question, typedLayout, responseOf(response, 'multichoice')) };
    }
    case 'truefalse': {
      const value = responseOf(response, 'truefalse')?.value ?? null;
      const feedback = value === null ? null : value ? question.feedbackTrue : question.feedbackFalse;
      return { ...base, type: 'truefalse', feedback, options: reviewTrueFalseOptions(question, value) };
    }
    case 'matching': {
      const typedLayout = layout as LayoutOf<'matching'>;
      const all = matchingChoices(question);
      const choices = typedLayout.choiceOrder.map((index) => all[index] ?? '');
      return { ...base, type: 'matching', choices, items: reviewMatchingItems(question, typedLayout, responseOf(response, 'matching')) };
    }
    case 'numerical': {
      const best = question.answers[bestAnswerIndex(question.answers.map((answer) => answer.fraction))];
      const numeric = reviewNumeric(
        numericalTargets(question.answers),
        question.answers.map((answer) => answer.feedback),
        best ? formatNumber(best.value) : '—',
        responseOf(response, 'numerical')?.answer ?? null,
      );
      return { ...base, type: 'numerical', ...numeric };
    }
    case 'calculated': {
      const { values } = layout as LayoutOf<'calculated'>;
      const computed = calculatedAnswerValues(question, values);
      const bestIndex = bestAnswerIndex(question.answers.map((answer) => answer.fraction));
      const best = question.answers[bestIndex];
      const targets = question.answers.map((answer, index) => ({
        value: computed[index] ?? null,
        tolerance: answer.tolerance,
        type: answer.toleranceType,
      }));
      const numeric = reviewNumeric(
        targets,
        question.answers.map((answer) => answer.feedback),
        best ? formatCalculatedAnswer(computed[bestIndex] ?? null, best.correctAnswerLength, best.correctAnswerFormat) : '—',
        responseOf(response, 'calculated')?.answer ?? null,
      );
      return { ...base, type: 'calculated', values, ...numeric };
    }
    case 'ddwtos': {
      const choices = (layout as LayoutOf<'ddwtos'>).choiceOrder.map((index) => ({
        index,
        text: question.choices[index]?.text ?? '',
        group: question.choices[index]?.group ?? 1,
      }));
      return { ...base, type: 'ddwtos', choices, gaps: reviewGaps(question, responseOf(response, 'ddwtos')) };
    }
    default:
      return {
        ...base,
        type: 'multianswer',
        parts: reviewClozeParts(question, layout as LayoutOf<'multianswer'>, responseOf(response, 'multianswer')),
      };
  }
}
