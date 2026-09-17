import { describe, expect, it } from 'vitest';
import { file } from '../__fixtures__/baseline.mjs';
import { checkNumbersWithoutSource, hasNumericFact, hasSourceMarker } from './numbers.mjs';

describe('checkNumbersWithoutSource', () => {
  it('warns about a percentage without a source in the paragraph', () => {
    const lecture = file('content/modules/m1/t01/lecture.mdx', [
      'Понад 97 % кредитного портфеля банку становили кредити пов’язаним компаніям.',
    ]);
    const findings = checkNumbersWithoutSource([lecture]);
    expect(findings).toMatchObject([{ level: 'warning', rule: 'number-without-source', line: 1 }]);
    expect(findings[0].hint).toContain('за даними');
  });

  it('accepts a number next to an attribution, a url or a norm code', () => {
    const attributed = file('content/modules/m1/t01/lecture.mdx', ['За даними ОЕСР 2023 р., 25 з 44 юрисдикцій мають концентровану власність.']);
    expect(checkNumbersWithoutSource([attributed])).toEqual([]);
    const withCode = file('content/banks/training/m1.yaml', [
      'questions:',
      '  - id: q1',
      '    stem: Кворум — більше 50 % голосуючих акцій.',
      '    lawRef:',
      '      - article: ст. 40 ч. 1 (AT-26)',
      "        checkedAt: '2026-09-15'",
    ]);
    expect(checkNumbersWithoutSource([withCode])).toEqual([]);
  });

  it('ignores invented data of computational questions and the numbers of the course design', () => {
    const numerical = file('content/banks/training/m1.yaml', [
      'questions:',
      '  - id: q1',
      '    type: numerical',
      '    stem: Товариство витратило 0,9 млн грн на моніторинг.',
    ]);
    expect(checkNumbersWithoutSource([numerical])).toEqual([]);
    const rubric = file('content/course.yaml', [
      'practicals:',
      '  - id: p01',
      '    rubric:',
      '      levels:',
      '        - description: Правильно зіставлено не менше 90% ознак.',
    ]);
    expect(checkNumbersWithoutSource([rubric])).toEqual([]);
  });

  it('recognises percentages, money and ratios', () => {
    expect(hasNumericFact('частка 5 %')).toBe(true);
    expect(hasNumericFact('148 млрд грн')).toBe(true);
    expect(hasNumericFact('25 з 44 юрисдикцій')).toBe(true);
    expect(hasNumericFact('у 1932 р. вийшла книга')).toBe(false);
    expect(hasSourceMarker('стаття 40')).toBe(true);
    expect(hasSourceMarker('просто текст')).toBe(false);
  });
});
