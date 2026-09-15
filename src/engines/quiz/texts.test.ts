import { describe, expect, it } from 'vitest';
import { QUESTION_STATE_LABELS, questionStateLabel } from './texts';

describe('questionStateLabel', () => {
  it('names every question state in Ukrainian', () => {
    expect(questionStateLabel('right')).toBe('Правильно');
    expect(questionStateLabel('partial')).toBe('Частково правильно');
    expect(questionStateLabel('wrong')).toBe('Неправильно');
    expect(questionStateLabel('gaveup')).toBe('Без відповіді');
    expect(Object.keys(QUESTION_STATE_LABELS)).toHaveLength(4);
  });
});
