import type { GradeResult, QuestionOf, ResponseOf } from '../types';
import { GAVE_UP, graded, percentToFraction } from './states';

/**
 * multichoice (single) — qtype_multichoice_single_question::grade_response: частка вибраного варіанта,
 *   без обмеження знизу (штраф робить оцінку від’ємною).
 * multichoice (multi) — qtype_multichoice_multi_question::grade_response: сума часток вибраних,
 *   обмежена відрізком [0, 1].
 */
export function gradeMultichoice(question: QuestionOf<'multichoice'>, response: ResponseOf<'multichoice'>): GradeResult {
  const chosen = response.selected.filter((index) => question.answers[index] !== undefined);
  if (chosen.length === 0) return GAVE_UP;

  if (question.single) {
    const answer = question.answers[chosen[0] ?? -1];
    return graded(answer ? percentToFraction(answer.fraction) : 0);
  }
  const sum = [...new Set(chosen)].reduce((acc, index) => acc + percentToFraction(question.answers[index]?.fraction ?? 0), 0);
  return graded(Math.min(Math.max(0, sum), 1));
}

/** truefalse — qtype_truefalse_question::grade_response: 1 або 0. */
export function gradeTrueFalse(question: QuestionOf<'truefalse'>, response: ResponseOf<'truefalse'>): GradeResult {
  return graded(response.value === question.correct ? 1 : 0);
}

/**
 * Варіанти для випадних списків відповідності: відповіді пар, потім дистрактори.
 * Однакові тексти зливаються в один варіант (qtype_match::initialise_question_instance, array_search strict).
 */
export function matchingChoices(question: QuestionOf<'matching'>): readonly string[] {
  return [...new Set([...question.pairs.map((pair) => pair.answer), ...question.distractors])];
}

/** matching — qtype_match_question::grade_response: правильні пари / усі пари. */
export function gradeMatching(question: QuestionOf<'matching'>, response: ResponseOf<'matching'>): GradeResult {
  const choices = matchingChoices(question);
  const answered = response.selections.some((selection) => selection !== null && choices[selection] !== undefined);
  if (!answered) return GAVE_UP;
  const right = question.pairs.filter((pair, index) => {
    const selection = response.selections[index];
    return selection !== null && selection !== undefined && choices[selection] === pair.answer;
  }).length;
  return graded(right / question.pairs.length);
}

export interface DdwtosGap {
  /** Індекс правильного варіанта в `choices`. */
  readonly choice: number;
  readonly group: number;
}

const GAP_PATTERN = /\[\[(\d+)\]\]/g;

/** Пропуски `[[n]]` у порядку появи в стовбурі. */
export function ddwtosGaps(question: QuestionOf<'ddwtos'>): readonly DdwtosGap[] {
  return [...question.stem.matchAll(GAP_PATTERN)].map((match) => {
    const choice = Number(match[1]) - 1;
    return { choice, group: question.choices[choice]?.group ?? 1 };
  });
}

/** ddwtos — qtype_gapselect_question_base::grade_response: правильно заповнені пропуски / усі пропуски. */
export function gradeDdwtos(question: QuestionOf<'ddwtos'>, response: ResponseOf<'ddwtos'>): GradeResult {
  const gaps = ddwtosGaps(question);
  const answered = response.gaps.some((gap) => gap !== null && gap !== undefined);
  if (!answered) return GAVE_UP;
  const right = gaps.filter((gap, index) => response.gaps[index] === gap.choice).length;
  return graded(right / gaps.length);
}
