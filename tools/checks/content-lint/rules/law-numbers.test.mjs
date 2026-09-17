import { describe, expect, it } from 'vitest';
import { baseline, file } from '../__fixtures__/baseline.mjs';
import { checkLawNumbers } from './law-numbers.mjs';

describe('checkLawNumbers', () => {
  const base = baseline();

  it('reports a law that is missing from legal-baseline.md', () => {
    const lecture = file('content/modules/m1/t01/lecture.mdx', [
      '---',
      'id: t01',
      '---',
      'Суд закрив провадження на підставі Закону № 590-IX від 13.05.2020.',
    ]);
    const findings = checkLawNumbers([lecture], base);
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ file: lecture.file, line: 4, level: 'error', rule: 'law-number' });
    expect(findings[0].message).toContain('№ 590-IX');
    expect(findings[0].hint).toContain('legal-baseline.md');
  });

  it('accepts a law from the baseline and ignores mentions inside caveat and urls', () => {
    const registry = file('content/course.yaml', [
      'cases:',
      '  - id: privatbank',
      '    caveat: Норми Закону № 590-IX відсутні в legal-baseline.md.',
      'note: Закон № 2465-IX чинний.',
      'source: https://doi.org/10.1016/0304-405X(76)90026-X',
    ]);
    expect(checkLawNumbers([registry], base)).toEqual([]);
  });

  it('warns when the law is known to the baseline only as unconfirmed', () => {
    const withUnconfirmed = { ...base, laws: new Map([...base.laws, ['999-XX', { confirmed: false, line: 1 }]]) };
    const lecture = file('content/modules/m1/t01/lecture.mdx', ['Закон № 999-XX встановлює строк.']);
    expect(checkLawNumbers([lecture], withUnconfirmed)).toMatchObject([{ level: 'warning', line: 1 }]);
  });
});
