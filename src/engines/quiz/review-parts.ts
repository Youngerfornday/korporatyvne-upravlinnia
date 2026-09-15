import { parseMoodleNumber } from '../shared/decimal-input';
import { formatNumber } from '../shared/number-format';
import { ddwtosGaps, matchingChoices } from './grading/choice';
import { gradeClozeParts, matchClozePart } from './grading/cloze';
import { matchNumericAnswer, type NumericTarget } from './grading/numeric';
import { FULL_CREDIT_PERCENT } from './grading/states';
import type { GradeResult, LayoutOf, QuestionOf, ResponseOf } from './types';

export interface ChoiceOptionReview {
  readonly index: number;
  readonly text: string;
  readonly fraction: number;
  readonly selected: boolean;
  readonly isCorrect: boolean;
  readonly feedback: string;
}

export interface TrueFalseOptionReview {
  readonly value: boolean;
  readonly label: string;
  readonly selected: boolean;
  readonly isCorrect: boolean;
  readonly feedback: string;
}

export interface MatchingItemReview {
  readonly index: number;
  readonly prompt: string;
  readonly selectedText: string | null;
  readonly correctText: string;
  readonly isCorrect: boolean;
  readonly feedback: string | null;
}

export interface NumericReview {
  readonly given: string | null;
  readonly matchedAnswer: number | null;
  readonly feedback: string | null;
  readonly correctAnswerText: string;
}

export interface GapReview {
  readonly index: number;
  readonly selectedText: string | null;
  readonly correctText: string;
  readonly isCorrect: boolean;
  readonly feedback: string | null;
}

export interface ClozePartReview {
  readonly index: number;
  readonly kind: 'multichoice' | 'shortanswer' | 'numerical';
  readonly grade: GradeResult | null;
  readonly given: string | null;
  readonly correctText: string;
  readonly feedback: string | null;
  /** Тексти варіантів у порядку показу (лише multichoice). */
  readonly options: readonly string[] | null;
}

const isFull = (percent: number) => Math.abs(percent - FULL_CREDIT_PERCENT) < 0.001;

/** Відповідь, яку показуємо як правильну: перша зі 100%, інакше з найбільшою оцінкою. */
export function bestAnswerIndex(fractions: readonly number[]): number {
  const full = fractions.findIndex(isFull);
  return full === -1 ? fractions.indexOf(Math.max(...fractions)) : full;
}

export function reviewMultichoiceOptions(
  question: QuestionOf<'multichoice'>,
  layout: LayoutOf<'multichoice'>,
  response: ResponseOf<'multichoice'> | null,
): ChoiceOptionReview[] {
  return layout.order.flatMap((index) => {
    const answer = question.answers[index];
    if (!answer) return [];
    return [
      {
        index,
        text: answer.text,
        fraction: answer.fraction / FULL_CREDIT_PERCENT,
        selected: response?.selected.includes(index) ?? false,
        isCorrect: question.single ? isFull(answer.fraction) : answer.fraction > 0,
        feedback: answer.feedback,
      },
    ];
  });
}

export function reviewTrueFalseOptions(question: QuestionOf<'truefalse'>, value: boolean | null): TrueFalseOptionReview[] {
  return [
    { value: true, label: 'Правда', selected: value === true, isCorrect: question.correct, feedback: question.feedbackTrue },
    { value: false, label: 'Неправда', selected: value === false, isCorrect: !question.correct, feedback: question.feedbackFalse },
  ];
}

export function reviewMatchingItems(
  question: QuestionOf<'matching'>,
  layout: LayoutOf<'matching'>,
  response: ResponseOf<'matching'> | null,
): MatchingItemReview[] {
  const choices = matchingChoices(question);
  return layout.stemOrder.flatMap((index) => {
    const pair = question.pairs[index];
    if (!pair) return [];
    const selection = response?.selections[index];
    const selectedText = selection === null || selection === undefined ? null : (choices[selection] ?? null);
    return [{ index, prompt: pair.prompt, selectedText, correctText: pair.answer, isCorrect: selectedText === pair.answer, feedback: pair.feedback ?? null }];
  });
}

export function reviewNumeric(
  targets: readonly NumericTarget[],
  feedbacks: readonly string[],
  correctAnswerText: string,
  answer: string | null,
): NumericReview {
  const given = answer !== null && answer.trim() !== '' ? answer : null;
  const value = given === null ? null : parseMoodleNumber(given).value;
  const matchedAnswer = value === null ? null : matchNumericAnswer(targets, value);
  return { given, matchedAnswer, feedback: matchedAnswer === null ? null : (feedbacks[matchedAnswer] ?? null), correctAnswerText };
}

/** Показ правильної відповіді calculated: `correctAnswerLength` знаків або значущих цифр (лише показ, не оцінювання). */
export function formatCalculatedAnswer(value: number | null, length: number, format: 'decimals' | 'significant-figures'): string {
  if (value === null) return '—';
  if (format === 'decimals') {
    return formatNumber(Number(value.toFixed(length)), { minimumFractionDigits: length, maximumFractionDigits: length });
  }
  return formatNumber(Number(value.toPrecision(Math.max(length, 1))));
}

export function reviewGaps(question: QuestionOf<'ddwtos'>, response: ResponseOf<'ddwtos'> | null): GapReview[] {
  return ddwtosGaps(question).map((gap, index) => {
    const chosen = response?.gaps[index];
    const choice = chosen === null || chosen === undefined ? undefined : question.choices[chosen];
    return {
      index,
      selectedText: choice?.text ?? null,
      correctText: question.choices[gap.choice]?.text ?? '',
      isCorrect: chosen === gap.choice,
      feedback: choice?.feedback ?? null,
    };
  });
}

function givenText(match: unknown, part: number | string | null): string | null {
  return match !== null && typeof part === 'string' ? part : null;
}

export function reviewClozeParts(
  question: QuestionOf<'multianswer'>,
  layout: LayoutOf<'multianswer'>,
  response: ResponseOf<'multianswer'> | null,
): ClozePartReview[] {
  const grades = response ? gradeClozeParts(question, response) : [];
  return question.subquestions.map((sub, index) => {
    const part = response?.parts[index] ?? null;
    const match = matchClozePart(sub, part);
    const matchedIndex = match?.answerIndex ?? null;
    const bestIndex = bestAnswerIndex(sub.answers.map((answer) => answer.fraction));
    const common = { index, grade: grades[index] ?? null, feedback: matchedIndex === null ? null : (sub.answers[matchedIndex]?.feedback ?? null) };
    switch (sub.kind) {
      case 'multichoice': {
        const order = layout.partOrders[index] ?? sub.answers.map((_, answerIndex) => answerIndex);
        const options = order.map((answerIndex) => sub.answers[answerIndex]?.text ?? '');
        const given = matchedIndex === null ? null : (sub.answers[matchedIndex]?.text ?? null);
        return { ...common, kind: sub.kind, given, correctText: sub.answers[bestIndex]?.text ?? '', options };
      }
      case 'shortanswer':
        return { ...common, kind: sub.kind, given: givenText(match, part), correctText: sub.answers[bestIndex]?.text ?? '', options: null };
      default: {
        const best = sub.answers[bestIndex];
        return { ...common, kind: sub.kind, given: givenText(match, part), correctText: best ? formatNumber(best.value) : '', options: null };
      }
    }
  });
}
