import { describe, expect, it } from 'vitest';
import { P01_MATRIX_LEVELS } from './__fixtures__/matrix';
import { rubricBandsFromLevels, rubricMark } from './rubric';
import { MATRIX_ERROR_MESSAGES, featureCheckText, itemStateLabel, marksOfText, matrixProgressText, matrixSummaryText, recordedResultText } from './texts';

const NBSP = '\u00A0';

function bands() {
  const result = rubricBandsFromLevels(P01_MATRIX_LEVELS);
  if (!result.ok) throw new Error(result.error.message);
  return result.value;
}

describe('тексти тренажера-матриці', () => {
  it('підпис стану формулювання — словом, не лише кольором', () => {
    expect(itemStateLabel('right')).toBe('правильно');
    expect(itemStateLabel('wrong')).toBe('неправильно');
    expect(itemStateLabel('unanswered')).toBe('без відповіді');
    expect(itemStateLabel('answered')).toBe('модель обрано');
  });

  it('прогрес і перевірка ознаки для aria-live', () => {
    expect(matrixProgressText({ answered: 12, total: 40 })).toBe('Зіставлено 12 з 40');
    expect(featureCheckText('Роль банків', 3, 4)).toBe('Ознака «Роль банків»: правильно 3 з 4.');
  });

  it('бали рубрики з правильними відмінками', () => {
    expect(marksOfText(1, 1)).toBe('1 бал з 1');
    expect(marksOfText(0.5, 1)).toBe('0,5 бала з 1');
    expect(marksOfText(0, 1)).toBe('0 балів з 1');
    expect(marksOfText(2, 3)).toBe('2 бали з 3');
  });

  it('підсумок оцінюваної спроби: частка, бал за рубрикою і опис рівня', () => {
    const summary = { total: 40, right: 36 };
    const text = matrixSummaryText(summary, rubricMark(bands(), 36, 40));
    expect(text).toBe(`Правильно 36 з 40 (90${NBSP}%). За рубрикою — 1 бал з 1: правильно зіставлено не менше 90% ознак і моделей.`);
  });

  it('збережений результат відновлюється з частки прогресу', () => {
    expect(recordedResultText(0.875, 40, bands())).toBe(`35 з 40 (87,5${NBSP}%) — 0,5 бала з 1`);
  });

  it('повідомлення про помилки рушія українською', () => {
    expect(Object.values(MATRIX_ERROR_MESSAGES).every((message) => /[А-Яа-яІіЇїЄєҐґ]/.test(message))).toBe(true);
  });
});
