import { describe, expect, it } from 'vitest';
import { baseline, course, file } from './__fixtures__/baseline.mjs';
import { lintContent } from './lint.mjs';

describe('lintContent', () => {
  it('collects findings of every rule in one pass', () => {
    const lecture = file('content/modules/m1/t01/lecture.mdx', [
      '---',
      'id: t01',
      'keyTerms:',
      '  - corporation',
      'lawRef:',
      '  - act: Закон України № 2465-IX',
      '    article: ст. 40 ч. 1 (AT-26)',
      "    checkedAt: '2026-09-14'",
      'updatedAt: 2026-09-16',
      '---',
      'Суд закрив провадження на підставі Закону № 590-IX, який передбачає компенсацію.',
      '',
      'Понад 97 % портфеля — кредити пов’язаним особам.',
      '',
      '<Term id="squeeze-out">примусовий викуп</Term>',
    ]);
    const findings = lintContent({ files: [lecture], baseline: baseline(), course, today: '2026-09-17' });
    expect([...new Set(findings.map((finding) => finding.rule))].sort()).toEqual([
      'case-caveat',
      'checked-date',
      'law-number',
      'lawref-consistency',
      'number-without-source',
      'term',
    ]);
  });

  it('works without a course registry and with the current date', () => {
    const lecture = file('content/modules/m1/t01/lecture.mdx', ['<Term id="corporation">корпорація</Term>']);
    expect(lintContent({ files: [lecture], baseline: baseline() }).map((finding) => finding.rule)).toEqual(['term']);
  });

  it('returns nothing for clean content', () => {
    const clean = file('content/modules/m1/t01/lecture.mdx', ['---', 'id: t01', 'updatedAt: 2026-09-16', '---', 'Звичайний абзац.']);
    expect(lintContent({ files: [clean], baseline: baseline(), course, today: '2026-09-17' })).toEqual([]);
  });
});
