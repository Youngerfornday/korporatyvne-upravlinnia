import { describe, expect, it } from 'vitest';
import { P01_MATRIX_LEVELS } from './__fixtures__/matrix';
import { rubricBandsFromLevels, rubricMark, type RubricBand } from './rubric';

function bands(): readonly RubricBand[] {
  const result = rubricBandsFromLevels(P01_MATRIX_LEVELS);
  if (!result.ok) throw new Error(result.error.message);
  return result.value;
}

describe('rubricBandsFromLevels', () => {
  it('читає пороги у відсотках з описів рівнів рубрики реєстру', () => {
    expect(bands()).toEqual([
      { minPercent: 90, points: 1, description: 'Правильно зіставлено не менше 90% ознак і моделей.' },
      { minPercent: 60, points: 0.5, description: 'Правильно зіставлено 60–89% ознак.' },
      { minPercent: 0, points: 0, description: 'Правильно зіставлено менше 60% ознак або завдання не виконано.' },
    ]);
  });

  it('впорядковує рівні за балами незалежно від порядку в реєстрі й приймає «12,5 %»', () => {
    const result = rubricBandsFromLevels([
      { points: 0, description: 'Менше 12,5 % або нічого.' },
      { points: 2, description: 'Не менше 75 % правильних.' },
      { points: 1, description: 'Від 12,5 % до 74 %.' },
    ]);
    expect(result.ok && result.value.map((band) => [band.points, band.minPercent])).toEqual([
      [2, 75],
      [1, 12.5],
      [0, 0],
    ]);
  });

  it('повертає помилку, якщо в ненульовому рівні немає порогу', () => {
    const result = rubricBandsFromLevels([
      { points: 1, description: 'Добре зіставлено.' },
      { points: 0, description: 'Погано.' },
    ]);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('no-threshold');
      expect(result.error.message).toContain('Добре зіставлено');
    }
  });

  it('повертає помилку для непослідовних порогів, порогу понад 100% і рубрики без нульового рівня', () => {
    const inconsistent = rubricBandsFromLevels([
      { points: 1, description: 'Не менше 60%.' },
      { points: 0.5, description: 'Не менше 70%.' },
      { points: 0, description: 'Решта.' },
    ]);
    expect(!inconsistent.ok && inconsistent.error.code).toBe('inconsistent');

    const tooHigh = rubricBandsFromLevels([
      { points: 1, description: 'Не менше 120%.' },
      { points: 0, description: 'Решта.' },
    ]);
    expect(!tooHigh.ok && tooHigh.error.code).toBe('inconsistent');

    const noZero = rubricBandsFromLevels([{ points: 1, description: 'Не менше 90%.' }]);
    expect(!noZero.ok && noZero.error.code).toBe('inconsistent');

    const empty = rubricBandsFromLevels([]);
    expect(!empty.ok && empty.error.code).toBe('inconsistent');
  });
});

describe('rubricMark', () => {
  it.each([
    [40, 40, 1, 100],
    [36, 40, 1, 90],
    [35, 40, 0.5, 87.5],
    [24, 40, 0.5, 60],
    [23, 40, 0, 57.5],
    [0, 40, 0, 0],
  ])('%i з %i правильних → %f бала', (right, total, points, percent) => {
    const mark = rubricMark(bands(), right, total);
    expect(mark.points).toBe(points);
    expect(mark.maxPoints).toBe(1);
    expect(mark.percent).toBeCloseTo(percent);
  });

  it('межа порівнюється без похибки округлення: 9 з 10 — рівно 90%', () => {
    expect(rubricMark(bands(), 9, 10).points).toBe(1);
    expect(rubricMark(bands(), 27, 30).points).toBe(1);
  });

  it('кидає помилку програміста на некоректних лічильниках', () => {
    expect(() => rubricMark(bands(), 5, 0)).toThrow();
    expect(() => rubricMark(bands(), 11, 10)).toThrow();
    expect(() => rubricMark([], 1, 1)).toThrow();
  });
});
