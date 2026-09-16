import { describe, expect, it } from 'vitest';
import * as fx from '../__fixtures__/questions';
import { compareWithWildcard, gradeMultianswer } from './cloze';

describe('compareWithWildcard (qtype_shortanswer_question::compare_string_with_wildcard)', () => {
  it.each([
    ['НКЦПФР', 'НКЦПФР', true, true],
    ['нкцпфр', 'НКЦПФР', true, true],
    ['нкцпфр', 'НКЦПФР', false, false],
    ['  НКЦПФР  ', 'НКЦПФР', true, true],
    ['Національна комісія', 'Національна*', true, true],
    ['будь-що', '*', true, true],
    ['a*b', 'a\\*b', true, true],
    ['axb', 'a\\*b', true, false],
    ['1+1=2', '1+1=2', true, true],
    ['(a)', '(a)', true, true],
  ])('«%s» vs pattern «%s» (ignore case %s) → %s', (text, pattern, ignoreCase, expected) => {
    expect(compareWithWildcard(text, pattern, ignoreCase)).toBe(expected);
  });

  it('normalises Unicode to NFC before comparing', () => {
    expect(compareWithWildcard('й', 'и\u0306', false)).toBe(true);
  });
  it('прирівнює три варіанти апострофа, бо експорт у Moodle дає їх як окремі відповіді', () => {
    expect(compareWithWildcard('обов’язки', "обов'язки", false)).toBe(true);
    expect(compareWithWildcard("обов'язки", 'обов’язки', false)).toBe(true);
    expect(compareWithWildcard('обовʼязки', 'обов’язки', false)).toBe(true);
    expect(compareWithWildcard('обовязки', 'обов’язки', false)).toBe(false);
  });

});

describe('gradeMultianswer (qtype_multianswer_question: weighted sum of subquestions)', () => {
  it('weights subquestion fractions by their marks', () => {
    // Arrange
    const question = fx.clozeWeighted();

    // Act
    const all = gradeMultianswer(question, { type: 'multianswer', parts: [0, 'нкцпфр', '101'] });
    const partial = gradeMultianswer(question, { type: 'multianswer', parts: [0, 'ДКЦПФР', '100'] });

    // Assert
    expect(all).toEqual({ fraction: 1, state: 'right' });
    expect(partial.fraction).toBeCloseTo((2 * 1 + 1 * 0.5 + 0) / 4, 12);
    expect(partial.state).toBe('partial');
  });

  it('lets a penalised multichoice part pull the total below zero, as Moodle does', () => {
    const result = gradeMultianswer(fx.clozeWeighted(), { type: 'multianswer', parts: [1, 'інше', '5'] });
    expect(result.fraction).toBeCloseTo((2 * -0.5) / 4, 12);
    expect(result.state).toBe('wrong');
  });

  it('skips blank parts and reports gave up only when every part is blank', () => {
    const question = fx.clozeWeighted();
    expect(gradeMultianswer(question, { type: 'multianswer', parts: [null, '', ' '] })).toEqual({ fraction: 0, state: 'gaveup' });
    expect(gradeMultianswer(question, { type: 'multianswer', parts: [null, 'НКЦПФР', ''] })).toEqual({ fraction: 0.25, state: 'partial' });
    expect(gradeMultianswer(question, { type: 'multianswer', parts: [2, '', ''] })).toEqual({ fraction: 0, state: 'wrong' });
  });

  it('matches shortanswer answers in bank order, so the * catch-all only applies last', () => {
    const result = gradeMultianswer(fx.clozeWeighted(), { type: 'multianswer', parts: [null, 'ДКЦПФР', null] });
    expect(result.fraction).toBeCloseTo(0.125, 12);
  });

  it('ignores parts whose kind does not match the subquestion', () => {
    expect(gradeMultianswer(fx.multianswer(), { type: 'multianswer', parts: ['0', 101] }).state).toBe('gaveup');
  });
});
