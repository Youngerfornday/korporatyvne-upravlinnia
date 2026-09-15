import { describe, expect, it } from 'vitest';
import * as fx from '../__fixtures__/questions';
import { calculatedAnswerValues, generateDatasetItems, gradeCalculated, gradeNumerical, matchNumericAnswer } from './numeric';

describe('gradeNumerical (qtype_numerical_question)', () => {
  it.each([['32,5'], ['32.5'], [' 32,50 '], ['3.25e1'], ['32,505']])('accepts «%s» within the nominal tolerance', (answer) => {
    expect(gradeNumerical(fx.numerical(), { type: 'numerical', answer })).toEqual({ fraction: 1, state: 'right' });
  });

  it.each([[' '], ['\u00A0'], ['\u202F']])('accepts «650 000» with «%s» as the thousands separator', (separator) => {
    const question = fx.parseQuestion('numerical', {
      ...fx.numerical(),
      answers: [{ value: 650000, tolerance: 0, fraction: 100, feedback: 'Так.' }],
    });
    expect(gradeNumerical(question, { type: 'numerical', answer: `650${separator}000` })).toEqual({ fraction: 1, state: 'right' });
  });

  it('uses the first answer whose tolerance matches, in bank order', () => {
    const question = fx.numericalGraded();
    expect(gradeNumerical(question, { type: 'numerical', answer: '32,5' })).toEqual({ fraction: 1, state: 'right' });
    expect(gradeNumerical(question, { type: 'numerical', answer: '33' })).toEqual({ fraction: 0.5, state: 'partial' });
  });

  it('clamps a negative answer fraction to zero, as apply_unit_penalty does', () => {
    expect(gradeNumerical(fx.numericalGraded(), { type: 'numerical', answer: '325' })).toEqual({ fraction: 0, state: 'wrong' });
  });

  it('grades the leading number even with trailing text, like deferred feedback', () => {
    expect(gradeNumerical(fx.numerical(), { type: 'numerical', answer: '32,5 грн' }).fraction).toBe(1);
  });

  it('gives zero for unmatched or unparsable input and gave up for blank input', () => {
    expect(gradeNumerical(fx.numerical(), { type: 'numerical', answer: '40' })).toEqual({ fraction: 0, state: 'wrong' });
    expect(gradeNumerical(fx.numerical(), { type: 'numerical', answer: 'тридцять' })).toEqual({ fraction: 0, state: 'wrong' });
    expect(gradeNumerical(fx.numerical(), { type: 'numerical', answer: '  ' })).toEqual({ fraction: 0, state: 'gaveup' });
  });

  it('accepts "0" as a real answer', () => {
    const question = fx.parseQuestion('numerical', {
      ...fx.numerical(),
      answers: [{ value: 0, tolerance: 0, fraction: 100, feedback: 'Нуль.' }],
    });
    expect(gradeNumerical(question, { type: 'numerical', answer: '0' })).toEqual({ fraction: 1, state: 'right' });
  });
});

describe('matchNumericAnswer', () => {
  it('returns the index of the matched answer or null', () => {
    const answers = fx.numericalGraded().answers.map((a) => ({ value: a.value, tolerance: a.tolerance, type: 'nominal' as const }));
    expect(matchNumericAnswer(answers, 33)).toBe(1);
    expect(matchNumericAnswer(answers, 1000)).toBeNull();
  });
});

describe('generateDatasetItems (qtype_calculated::generate_dataset_item)', () => {
  it('generates itemCount deterministic items within bounds, rounded to the dataset decimals', () => {
    // Arrange
    const question = fx.parseQuestion('calculated', {
      ...fx.calculated(),
      datasets: [
        { name: 'p', min: 500, max: 900, decimals: 0 },
        { name: 'r', min: 0.1, max: 0.9, decimals: 2 },
        { name: 'n', min: 10, max: 1000, decimals: 1, distribution: 'loguniform' },
      ],
      answers: [{ formula: '{p} * {r} / {n}', fraction: 100, feedback: 'Так.' }],
      itemCount: 25,
    });

    // Act
    const items = generateDatasetItems(question);

    // Assert
    expect(items).toHaveLength(25);
    expect(generateDatasetItems(question)).toEqual(items);
    for (const item of items) {
      expect(item['p']).toBeGreaterThanOrEqual(500);
      expect(item['p']).toBeLessThanOrEqual(900);
      expect(Number.isInteger(item['p'])).toBe(true);
      expect(item['r']).toBe(Number((item['r'] ?? 0).toFixed(2)));
      expect(item['n']).toBeGreaterThanOrEqual(10);
      expect(item['n']).toBeLessThanOrEqual(1000);
    }
  });
});

describe('calculatedAnswerValues and gradeCalculated', () => {
  const values = { p: 650, r: 50, n: 10 };

  it('evaluates each answer formula for the variant values', () => {
    expect(calculatedAnswerValues(fx.calculated(), values)).toEqual([32.5]);
  });

  it('uses the relative ±1% tolerance on the unrounded answer', () => {
    const layout = { type: 'calculated', variant: 0, values } as const;
    expect(gradeCalculated(fx.calculated(), layout, { type: 'calculated', answer: '32,8' }).fraction).toBe(1);
    expect(gradeCalculated(fx.calculated(), layout, { type: 'calculated', answer: '32,1' }).fraction).toBe(0);
    expect(gradeCalculated(fx.calculated(), layout, { type: 'calculated', answer: '' }).state).toBe('gaveup');
  });

  it('gives null for a formula that cannot be evaluated and never awards credit for it', () => {
    const broken = { p: 650, r: 50, n: 0 };
    expect(calculatedAnswerValues(fx.calculated(), broken)).toEqual([null]);
    const layout = { type: 'calculated', variant: 0, values: broken } as const;
    expect(gradeCalculated(fx.calculated(), layout, { type: 'calculated', answer: '0' })).toEqual({ fraction: 0, state: 'wrong' });
  });
});
