import type { GradeResult, QuestionState } from '../types';

/** question_state::graded_state_for_fraction (question/engine/states.php). */
export function stateForFraction(fraction: number): Exclude<QuestionState, 'gaveup'> {
  if (fraction < 0.000001) return 'wrong';
  if (fraction > 0.999999) return 'right';
  return 'partial';
}

export function graded(fraction: number): GradeResult {
  return { fraction, state: stateForFraction(fraction) };
}

export const GAVE_UP: GradeResult = Object.freeze({ fraction: 0, state: 'gaveup' });

/** qtype_multianswer_question::combine_states. */
export function combineStates(overall: QuestionState | null, next: QuestionState): QuestionState {
  if (overall === null) return next;
  const failed = (state: QuestionState) => state === 'gaveup' || state === 'wrong';
  if (overall === 'gaveup' && next === 'gaveup') return 'gaveup';
  if (failed(overall) && failed(next)) return 'wrong';
  if (overall === 'right' && next === 'right') return 'right';
  return 'partial';
}

export const FULL_CREDIT_PERCENT = 100;

/** Оцінки в банку записані у відсотках (як у Moodle XML); рушій працює з частками. */
export function percentToFraction(percent: number): number {
  return percent / FULL_CREDIT_PERCENT;
}
