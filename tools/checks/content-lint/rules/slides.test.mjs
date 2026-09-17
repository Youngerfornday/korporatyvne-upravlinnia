import { describe, expect, it } from 'vitest';
import { baseline, course, file } from '../__fixtures__/baseline.mjs';
import { lintContent } from '../lint.mjs';
import { checkSourceUsage } from './sources.mjs';
import { checkSlides, lectureNumbers, numbersWithUnits } from './slides.mjs';

const SLIDES = 'content/modules/m1/t01/slides.yaml';

const lecture = () => file('content/modules/m1/t01/lecture.mdx', [
  '---',
  'id: t01',
  'updatedAt: 2026-09-16',
  '---',
  "import Fig1 from './fig-01-separation.svg';",
  '',
  'За позицією НБУ, понад 97 % портфеля — кредити пов’язаним особам; нестача капіталу — 148 млрд грн.',
  'Без роботи залишаться 1 200 працівників.',
]);

const topicSources = () => file('content/modules/m1/t01/sources.yaml', [
  'topic: t01',
  'sources:',
  '  - id: nbu-privatbank-2016',
  '    title: Брифінг НБУ',
  '    url: https://example.org/nbu',
  "    checkedAt: '2026-09-16'",
]);

const registry = {
  ...course,
  topics: [{ id: 't01', cases: [{ case: 'privatbank' }] }],
};

const deck = (slideLines) => file(SLIDES, ['topic: t01', 'slides:', '  - id: title', '    type: title', ...slideLines]);

describe('checkSlides', () => {
  it('requires sources or lawRef on a slide with a percentage or a sum', () => {
    const slides = deck([
      '  - id: numbers',
      '    type: bullets',
      '    title: Цифри',
      '    bullets:',
      '      - Понад 97 % портфеля — кредити пов’язаним особам',
      '    notes: За позицією НБУ, нестача капіталу — 148 млрд грн.',
    ]);
    const findings = checkSlides([slides, lecture()], registry);
    expect(findings).toMatchObject([
      { rule: 'slide-number-source', level: 'error', line: 9 },
    ]);
    expect(findings[0].quote).toContain('97 %');
  });

  it('accepts numbers with sources that also appear in the lecture', () => {
    const slides = deck([
      '  - id: numbers',
      '    type: bullets',
      '    title: Цифри',
      '    bullets: [Понад 97 % портфеля, Нестача капіталу — 148 млрд грн]',
      '    sources: [nbu-privatbank-2016]',
    ]);
    expect(checkSlides([slides, lecture()], registry)).toEqual([]);
  });

  it('warns about a number that the lecture of the topic does not contain', () => {
    const slides = deck([
      '  - id: numbers',
      '    type: bullets',
      '    title: Цифри',
      '    bullets: [Нестача капіталу — 155 млрд грн]',
      '    sources: [nbu-privatbank-2016]',
    ]);
    const findings = checkSlides([slides, lecture()], registry);
    expect(findings).toMatchObject([{ rule: 'slide-number-lecture', level: 'warning', line: 8 }]);
    expect(findings[0].message).toContain('155');
    expect(checkSlides([slides], registry)).toEqual([]);
  });

  it('requires a legal-baseline code in the lawRef of a norm slide', () => {
    const slides = deck([
      '  - id: norm',
      '    type: norm',
      '    title: Типи АТ',
      '    text: АТ бувають лише публічні або приватні.',
      '    lawRef:',
      '      act: Закон № 2465-IX',
      '      article: ст. 6 ч. 1–4',
      "      checkedAt: '2026-09-14'",
    ]);
    expect(checkSlides([slides], registry)).toMatchObject([{ rule: 'slide-norm-code', level: 'error', line: 11 }]);
  });

  it('accepts only cases of the registry that belong to the topic', () => {
    const slides = deck([
      '  - id: case-a',
      '    type: case',
      '    title: Кейс',
      '    case: privatbank',
      '    facts: [Факт]',
      '    question: Питання?',
      '  - id: case-b',
      '    type: case',
      '    title: Кейс',
      '    case: toyota',
      '    facts: [Факт]',
      '    question: Питання?',
      '  - id: case-c',
      '    type: case',
      '    title: Кейс',
      '    case: ghost',
      '    facts: [Факт]',
      '    question: Питання?',
    ]);
    const findings = checkSlides([slides], registry);
    expect(findings.map((finding) => [finding.rule, finding.line])).toEqual([
      ['slide-case', 14],
      ['slide-case', 20],
    ]);
    expect(findings[0].message).toContain('t01');
    expect(findings[1].message).toContain('не зареєстровано');
  });

  it('accepts only figures the lecture of the topic imports', () => {
    const slides = deck([
      '  - id: fig-ok',
      '    type: figure',
      '    title: Схема',
      '    figure: fig-01-separation.svg',
      '    caption: Рисунок 1.',
      '  - id: fig-missing',
      '    type: figure',
      '    title: Схема',
      '    figure: fig-09-ghost.svg',
      '    caption: Рисунок 9.',
    ]);
    expect(checkSlides([slides, lecture()], registry)).toMatchObject([{ rule: 'slide-figure', level: 'error', line: 13 }]);
    expect(checkSlides([slides], registry)).toEqual([]);
  });

  it('ignores files that are not presentations', () => {
    expect(checkSlides([lecture(), topicSources()], registry)).toEqual([]);
  });
});

describe('numbers of presentations', () => {
  it('extracts numbers followed by a percent sign or a money unit', () => {
    expect(numbersWithUnits('Понад 97 % і 151,2 млрд грн, а 1 200 працівників і 2016 р.')).toEqual(['97', '151,2']);
    expect(numbersWithUnits('Значний пакет — 5% і більше; 3,44 % акцій; 46 тис. компаній')).toEqual(['5', '3,44', '46']);
  });

  it('collects every number of the lecture, including grouped thousands', () => {
    const numbers = lectureNumbers('Звільнення 1 200 працівників; 151,2 млрд грн; 33–36 %.');
    expect(numbers.has('1200')).toBe(true);
    expect(numbers.has('200')).toBe(true);
    expect(numbers.has('151,2')).toBe(true);
    expect(numbers.has('36')).toBe(true);
  });
});

describe('presentations in other rules', () => {
  it('resolves slide sources against the sources of the topic', () => {
    const slides = deck([
      '  - id: numbers',
      '    type: bullets',
      '    title: Цифри',
      '    bullets: [Факт]',
      '    sources: [nbu-privatbank-2016, ghost-source]',
    ]);
    const findings = checkSourceUsage([topicSources(), slides]);
    expect(findings).toMatchObject([{ rule: 'source-missing', level: 'error', line: 9 }]);
    expect(findings[0].message).toContain('ghost-source');
  });

  it('leaves numbers of presentations to the presentation rule', () => {
    const slides = deck([
      '  - id: numbers',
      '    type: bullets',
      '    title: Цифри',
      '    bullets: [Нестача капіталу — 148 млрд грн]',
      '    sources: [nbu-privatbank-2016]',
    ]);
    const findings = lintContent({ files: [slides, lecture(), topicSources()], baseline: baseline(), course: registry, today: '2026-09-17' });
    expect(findings).toEqual([]);
  });
});
