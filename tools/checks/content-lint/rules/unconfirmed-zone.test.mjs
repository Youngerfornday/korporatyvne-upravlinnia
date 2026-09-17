import { describe, expect, it } from 'vitest';
import { baseline, file } from '../__fixtures__/baseline.mjs';
import { checkUnconfirmedZone, hasNormMarker } from './unconfirmed-zone.mjs';

describe('checkUnconfirmedZone', () => {
  const base = baseline();

  it('warns about a normative statement that touches an unconfirmed item', () => {
    const lecture = file('content/modules/m1/t01/lecture.mdx', [
      'Звичайний абзац без норм.',
      '',
      'Закон вимагає, щоб незалежні директори становили третину ради директорів ПАТ.',
    ]);
    const findings = checkUnconfirmedZone([lecture], base);
    expect(findings).toMatchObject([{ level: 'warning', rule: 'unconfirmed-zone', line: 3 }]);
    expect(findings[0].message).toContain('пункту 1');
    expect(findings[0].hint).toContain('Не підтверджено');
  });

  it('does not react to a neighbouring topic or to the caveat field', () => {
    const near = file('content/modules/m1/t01/lecture.mdx', [
      'Закон встановлює частку незалежних директорів у наглядовій раді.',
      '',
      'Принципи ОЕСР редакції 2015 р. згадує кодекс НКЦПФР.',
    ]);
    expect(checkUnconfirmedZone([near], base)).toEqual([]);
    const registry = file('content/course.yaml', [
      'cases:',
      '  - id: x',
      '    caveat: Закон вимагає незалежних директорів у раді директорів ПАТ — не підтверджено.',
    ]);
    expect(checkUnconfirmedZone([registry], base)).toEqual([]);
  });

  it('needs a norm marker in the sentence', () => {
    expect(hasNormMarker('Стаття 40 встановлює кворум')).toBe(true);
    expect(hasNormMarker('Просто речення про раду')).toBe(false);
    const withoutMarker = file('content/modules/m1/t01/lecture.mdx', ['Незалежні директори в раді директорів ПАТ працюють добре.']);
    expect(checkUnconfirmedZone([withoutMarker], base)).toEqual([]);
  });
});
