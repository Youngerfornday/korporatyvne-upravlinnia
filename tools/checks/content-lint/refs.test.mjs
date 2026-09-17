import { describe, expect, it } from 'vitest';
import { file } from './__fixtures__/baseline.mjs';
import { baselineMentionsIn, codesIn, lawRefsOf, sourceCheckedDates } from './refs.mjs';

describe('lawRefsOf', () => {
  it('reads lawRef maps with the lines of article and checkedAt', () => {
    const bank = file('content/banks/training/m1.yaml', [
      'questions:',
      '  - id: q1',
      '    lawRef:',
      '      - act: Закон України № 2465-IX',
      '        article: ст. 40 ч. 1 (AT-26)',
      "        checkedAt: '2026-09-15'",
      '        url: https://example.org/40',
    ]);
    expect(lawRefsOf(bank)).toEqual([{
      line: 4, endLine: 7, articleLine: 5, dateLine: 6,
      act: 'Закон України № 2465-IX', article: 'ст. 40 ч. 1 (AT-26)', checkedAt: '2026-09-15', url: 'https://example.org/40', codes: ['AT-26'],
    }]);
  });

  it('treats a <LawNorm> tag in the lecture body as a law reference', () => {
    const lecture = file('content/modules/m1/t01/lecture.mdx', [
      '---',
      'id: t01',
      '---',
      'Абзац.',
      '',
      '<LawNorm title="a > b" act="Закон № 361-IX" article="ст. 1 ч. 1 п. 30; ст. 5-1 (legal-baseline UBO-01, UBO-03)"',
      '  url="https://example.org/361" checkedAt="2026-09-16">',
      '  Текст норми.',
      '</LawNorm>',
      '',
      '<LawNorm title="без дати" article="ст. 6 (AT-01)">Текст.</LawNorm>',
    ]);
    expect(lawRefsOf(lecture)).toEqual([{
      line: 6, endLine: 7, articleLine: 6, dateLine: 6,
      act: 'Закон № 361-IX', article: 'ст. 1 ч. 1 п. 30; ст. 5-1 (legal-baseline UBO-01, UBO-03)', checkedAt: '2026-09-16', url: 'https://example.org/361', codes: ['UBO-01', 'UBO-03'],
    }]);
  });

  it('does not look for <LawNorm> tags in YAML', () => {
    expect(lawRefsOf(file('content/course.yaml', ['note: \'<LawNorm article="ст. 6 (AT-01)" checkedAt="2026-09-14">\'']))).toEqual([]);
  });
});

describe('code helpers', () => {
  it('finds codes and baseline mentions in prose', () => {
    expect(codesIn('ст. 6 (AT-01, ESG-UA-03, AT-01)')).toEqual(['AT-01', 'ESG-UA-03']);
    expect(baselineMentionsIn('режим (legal-baseline KKU-03) і legal-baseline, MS-04')).toEqual(['KKU-03', 'MS-04']);
  });

  it('lists check dates of sources but not of law references', () => {
    const practical = file('content/practicals/p01.yaml', [
      'sources:',
      '  - id: oecd',
      '    title: OECD',
      '    url: https://example.org/oecd',
      "    checkedAt: '2026-09-15'",
      '  - url: https://example.org/untitled',
      "    checkedAt: '2026-09-15'",
      'lawRef:',
      '  - article: ст. 6 (AT-01)',
      '    url: https://example.org/6',
      "    checkedAt: '2026-09-14'",
    ]);
    expect(sourceCheckedDates(practical)).toEqual([
      { line: 2, checkedAt: '2026-09-15', id: 'oecd', title: 'OECD' },
      { line: 6, checkedAt: '2026-09-15', id: '', title: '' },
    ]);
  });
});
