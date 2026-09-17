import { describe, expect, it } from 'vitest';
import { file } from '../__fixtures__/baseline.mjs';
import { checkLawrefConsistency } from './lawref-consistency.mjs';

const lecture = (lawRef, body = 'У тексті згадано AT-01.') => file('content/modules/m1/t01/lecture.mdx', [
  '---',
  'id: t01',
  'lawRef:',
  ...lawRef.map((code) => `  - { article: 'ст. 6 (${code})', checkedAt: '2026-09-14' }`),
  '---',
  body,
]);

describe('lawref-consistency', () => {
  it('reports codes missing on either side and lists the differences', () => {
    const files = [
      lecture(['AT-01', 'AT-02'], 'У тексті згадано AT-01.'),
      file('content/modules/m1/t01/slides.yaml', ['topic: t01', 'slides:', '  - id: one', '    text: Слайд посилається на AT-03.']),
    ];

    const findings = checkLawrefConsistency(files);

    expect(findings).toMatchObject([{ level: 'error', rule: 'lawref-consistency' }]);
    expect(findings[0].message).toContain('AT-02');
    expect(findings[0].message).toContain('AT-03');
    expect(findings[0].hint).toContain('Синхронізуйте');
  });

  it('accepts codes present in lecture text and slides', () => {
    const files = [
      lecture(['AT-01'], 'У тексті згадано AT-01.'),
      file('content/modules/m1/t01/slides.yaml', ['topic: t01', 'slides:', '  - id: one', '    text: Слайд посилається на AT-01.']),
    ];

    expect(checkLawrefConsistency(files)).toEqual([]);
  });
});
