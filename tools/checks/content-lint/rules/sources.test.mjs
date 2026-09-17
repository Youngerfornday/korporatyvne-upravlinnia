import { describe, expect, it } from 'vitest';
import { file } from '../__fixtures__/baseline.mjs';
import { checkSourceUsage, references, usageText } from './sources.mjs';

const topicSources = (extra = []) => file('content/modules/m1/t01/sources.yaml', [
  'topic: t01',
  'sources:',
  '  - id: berle-means-1932',
  '    title: The Modern Corporation and Private Property',
  '    url: https://example.org/berle',
  "    checkedAt: '2026-09-16'",
  ...extra,
]);

describe('checkSourceUsage', () => {
  it('warns about a source nobody refers to', () => {
    const lecture = file('content/modules/m1/t01/lecture.mdx', ['Абзац без посилань.']);
    const findings = checkSourceUsage([topicSources(), lecture]);
    expect(findings).toMatchObject([{ level: 'warning', rule: 'source-unused', line: 3 }]);
    expect(findings[0].message).toContain('berle-means-1932');
  });

  it('counts a mention by id, by url and by title', () => {
    const byId = file('content/modules/m1/t01/lecture.mdx', ['Див. [джерело](#src-berle-means-1932).']);
    expect(checkSourceUsage([topicSources(), byId])).toEqual([]);
    const byUrl = file('content/modules/m1/t01/lecture.mdx', ['Текст https://example.org/berle тут.']);
    expect(checkSourceUsage([topicSources(), byUrl])).toEqual([]);
    const byTitle = file('content/modules/m1/t01/lecture.mdx', ['Книга The Modern Corporation and Private Property.']);
    expect(checkSourceUsage([topicSources(), byTitle])).toEqual([]);
  });

  it('reports a dangling reference as an error', () => {
    const lecture = file('content/modules/m1/t01/lecture.mdx', [
      'Див. [джерело](#src-berle-means-1932) і <SourceList ids={["ghost-source"]} />.',
    ]);
    const findings = checkSourceUsage([topicSources(), lecture]);
    expect(findings).toMatchObject([{ level: 'error', rule: 'source-missing', line: 1 }]);
    expect(findings[0].message).toContain('ghost-source');
  });

  it('checks a practical against its own list and counts alsoSources', () => {
    const practical = file('content/practicals/p01.yaml', [
      'id: p01',
      'sources:',
      '  - id: oecd-principles-2023',
      '    title: G20/OECD Principles',
      '    url: https://example.org/oecd',
      "    checkedAt: '2026-09-15'",
      '  - id: jcgc-code-2021',
      '    title: Japan CG Code',
      '    url: https://example.org/jcgc',
      "    checkedAt: '2026-09-15'",
      'trainer:',
      '  features:',
      '    - id: f1',
      '      cells:',
      '        - model: japanese',
      '          source: oecd-principles-2023',
      '          alsoSources: [jcgc-code-2021]',
      '        - model: german',
      '          source: ghost-source',
    ]);
    const findings = checkSourceUsage([practical]);
    expect(findings).toMatchObject([{ level: 'error', rule: 'source-missing', line: 19 }]);
    expect(references(practical).map((reference) => reference.id)).toEqual(['oecd-principles-2023', 'jcgc-code-2021', 'ghost-source']);
    expect(usageText(practical)).not.toContain('G20/OECD Principles');
  });

  it('ignores files without any source list', () => {
    expect(checkSourceUsage([file('content/course.yaml', ['title: Курс', 'source: whatever'])])).toEqual([]);
  });
});
