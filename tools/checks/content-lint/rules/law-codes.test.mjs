import { describe, expect, it } from 'vitest';
import { baseline, file } from '../__fixtures__/baseline.mjs';
import { checkLawCodes } from './law-codes.mjs';

const lawRef = (article) => [
  'questions:',
  '  - id: q1',
  '    lawRef:',
  '      - act: Закон України № 2465-IX',
  `        article: ${article}`,
  '        checkedAt: 2026-09-15',
];

describe('checkLawCodes', () => {
  const base = baseline();

  it('reports a code that does not exist in the baseline', () => {
    const findings = checkLawCodes([file('content/banks/training/m1.yaml', lawRef('ст. 40 ч. 1 (AT-99)'))], base);
    expect(findings).toMatchObject([{ level: 'error', rule: 'law-code', line: 5 }]);
    expect(findings[0].message).toContain('AT-99');
  });

  it('reports an article that the baseline does not record for the code', () => {
    const findings = checkLawCodes([file('content/banks/training/m1.yaml', lawRef('ст. 40 ч. 1 (AT-01)'))], base);
    expect(findings).toHaveLength(1);
    expect(findings[0].message).toContain('ст. 40');
    expect(findings[0].message).toContain('AT-01');
  });

  it('accepts an article covered by any of the codes listed together', () => {
    expect(checkLawCodes([file('content/banks/training/m1.yaml', lawRef('ст. 6 ч. 1–4; ст. 40 ч. 1 (AT-01, AT-26)'))], base)).toEqual([]);
  });

  it('accepts a reference without articles and checks prose mentions of the baseline', () => {
    expect(checkLawCodes([file('content/banks/training/m1.yaml', lawRef('розділи I–VI (MS-01)'))], base)).toEqual([]);
    const note = file('content/practicals/p01.yaml', ['sources:', '  - id: x', "    note: 'Режим «дотримуйся або пояснюй» (legal-baseline KKU-03).'"]);
    expect(checkLawCodes([note], base)).toMatchObject([{ level: 'error', line: 3 }]);
  });

  it('ignores tokens that only look like codes', () => {
    const sources = file('content/modules/m1/t01/sources.yaml', ['sources:', '  - id: book', '    note: ISBN-13 і звіт S. Prt. 107-70.']);
    expect(checkLawCodes([sources], base)).toEqual([]);
  });
});
