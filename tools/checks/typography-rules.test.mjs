import { describe, expect, it } from 'vitest';
import { formatFindings, lintMdx, lintYaml, proseOfMdx } from './typography-rules.mjs';

describe('lintYaml', () => {
  const source = ['topic: t01', 'terms:', '  - id: x', "    term: Об'єкт", '    definition: "Норма № 5"', 'note: ok'].join('\n');

  it('reports visible typography faults in string values with their line numbers', () => {
    expect(lintYaml(source)).toEqual([{ line: 4, actual: "Об'єкт", expected: 'Об’єкт' }]);
  });

  it('reports missing non-breaking spaces only in strict mode', () => {
    const strict = lintYaml(source, { nbsp: true });
    expect(strict.map((f) => f.line)).toEqual([4, 5]);
    expect(strict[1]?.expected).toBe('Норма № 5');
  });

  it('ignores keys, syntax quotes and urls', () => {
    const yaml = ['url: "https://zakon.rada.gov.ua/laws/show/2465-20"', 'title: «Уже добре»', 'list:', '  - "просто рядок"'].join('\n');
    expect(lintYaml(yaml)).toEqual([]);
  });
});

describe('lintMdx', () => {
  const source = [
    '---',
    'id: t01',
    "description: Об'єкт у статуті",
    '---',
    'import { x } from "./x"',
    '',
    '## Заголовок з "лапками"',
    '',
    'Текст із `кодом "x"` і "лапками".',
    '',
    '```',
    'a - "b"',
    '```',
    '',
    '<Formula label="Кворум - S">S·k / (N + 1) + 1</Formula>',
    '',
    '<Term id="corp">корпорації</Term> в 2023 р.',
  ].join('\n');

  it('checks frontmatter strings, prose lines and jsx attribute values, skipping code, esm and tag syntax', () => {
    const findings = lintMdx(source);
    expect(findings.map((f) => f.line)).toEqual([3, 7, 9, 15]);
    expect(findings[0]).toMatchObject({ actual: "Об'єкт у статуті", expected: 'Об’єкт у статуті' });
    expect(findings[1]?.expected).toBe('## Заголовок з «лапками»');
    expect(findings[2]?.expected).toContain('«лапками»');
    expect(findings[3]?.expected).toContain('Кворум — S');
  });

  it('reports missing non-breaking spaces only in strict mode', () => {
    expect(lintMdx(source).some((f) => f.line === 17)).toBe(false);
    const strict = lintMdx(source, { nbsp: true });
    expect(strict.find((f) => f.line === 17)?.expected).toContain('в 2023 р.');
  });

  it('masks removed regions without shifting line numbers', () => {
    const prose = proseOfMdx(source);
    expect(prose.split('\n')).toHaveLength(source.split('\n').length);
    expect(prose).not.toContain('import');
    expect(prose).not.toContain('Formula');
    expect(prose).toContain('Кворум - S');
  });
});

describe('formatFindings', () => {
  it('renders a Ukrainian report and makes non-breaking spaces visible', () => {
    const [line] = formatFindings('content/x.yaml', [{ line: 2, actual: 'ст. 3', expected: 'ст. 3' }]);
    expect(line).toContain('content/x.yaml:2');
    expect(line).toContain('є:     ст. 3');
    expect(line).toContain('треба: ст.⍽3');
  });
});
