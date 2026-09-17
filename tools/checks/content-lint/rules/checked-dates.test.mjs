import { describe, expect, it } from 'vitest';
import { baseline, file } from '../__fixtures__/baseline.mjs';
import { checkCheckedDates, todayIso } from './checked-dates.mjs';

const lawRef = (code, date) => [
  'lawRef:',
  '  - act: Закон України № 2465-IX',
  `    article: ст. 40 ч. 1 (${code})`,
  `    checkedAt: '${date}'`,
];

describe('checkCheckedDates', () => {
  const base = baseline();
  const today = '2026-09-17';

  it('reports a date that contradicts the rule of the baseline document', () => {
    const findings = checkCheckedDates([file('content/banks/training/m1.yaml', lawRef('AT-26', '2026-09-14'))], base, today);
    expect(findings).toMatchObject([{ level: 'error', rule: 'checked-date', line: 4 }]);
    expect(findings[0].message).toContain('2026-09-15');
    expect(findings[0].hint).toContain('Ключові числа');
  });

  it('accepts the date from the key-numbers table and from a section', () => {
    expect(checkCheckedDates([file('content/banks/training/m1.yaml', lawRef('AT-26', '2026-09-15'))], base, today)).toEqual([]);
    expect(checkCheckedDates([file('content/banks/training/m1.yaml', lawRef('UBO-03', '2026-09-16'))], base, today)).toEqual([]);
    expect(checkCheckedDates([file('content/banks/training/m1.yaml', lawRef('MS-01', '2026-09-14'))], base, today)).toEqual([]);
  });

  it('reports a future check date of a norm and of a source', () => {
    const future = checkCheckedDates([file('content/banks/training/m1.yaml', lawRef('AT-26', '2026-10-01'))], base, today);
    expect(future.map((finding) => finding.message)).toEqual([
      expect.stringContaining('у майбутньому'),
      expect.stringContaining('legal-baseline.md фіксує'),
    ]);
    const sources = file('content/modules/m1/t01/sources.yaml', [
      'topic: t01',
      'sources:',
      '  - id: berle-means-1932',
      '    url: https://example.org/b',
      "    checkedAt: '2026-12-31'",
    ]);
    expect(checkCheckedDates([sources], base, today)).toMatchObject([{ level: 'error', line: 3 }]);
  });

  it('checks the date of a <LawNorm> tag and accepts the 2026-09-16 check of beneficial ownership codes', () => {
    const lecture = file('content/modules/m1/t01/lecture.mdx', [
      '<LawNorm act="Закон № 361-IX" article="ст. 5-1 ч. 1 (legal-baseline UBO-03)" checkedAt="2026-09-16">Норма.</LawNorm>',
      '',
      '<LawNorm act="Закон № 2465-IX" article="ст. 40 ч. 1 (legal-baseline AT-26)" checkedAt="2026-09-16">Норма.</LawNorm>',
    ]);
    expect(checkCheckedDates([lecture], base, today)).toMatchObject([{ level: 'error', line: 3, message: expect.stringContaining('AT-26') }]);
  });

  it('defaults to the current day', () => {
    expect(todayIso(new Date('2026-09-17T10:00:00Z'))).toBe('2026-09-17');
    expect(todayIso()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
