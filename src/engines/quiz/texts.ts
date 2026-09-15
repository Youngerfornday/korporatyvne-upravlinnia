import type { QuestionState } from './types';

/** Підписи станів питання для вердикту й навігатора (разом зі знаком, не лише кольором). */
export const QUESTION_STATE_LABELS: Readonly<Record<QuestionState, string>> = {
  right: 'Правильно',
  partial: 'Частково правильно',
  wrong: 'Неправильно',
  gaveup: 'Без відповіді',
};

export function questionStateLabel(state: QuestionState): string {
  return QUESTION_STATE_LABELS[state];
}
