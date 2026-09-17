import { describe, expect, it } from 'vitest';
import { legalFormConditionNote, matrixConditionNote, practicalSections, practicalXpChip } from './view';

describe('practicalSections', () => {
  it('keeps the shared sections around the trainer ones', () => {
    const ids = practicalSections('model-matrix').map((section) => section.id);
    expect(ids).toEqual(['meta', 'umova', 'trenazher', 'kompanii', 'ese', 'rubryka', 'dani']);
  });

  it('gives the legal-form practical its own middle sections', () => {
    const ids = practicalSections('legal-form-choice').map((section) => section.id);
    expect(ids).toEqual(['meta', 'umova', 'trenazher', 'startapy', 'dohovir', 'ese', 'rubryka', 'dani']);
    expect(practicalSections('legal-form-choice').at(-1)?.label).toBe('Статистика, норми й джерела');
  });

  it('never repeats an anchor', () => {
    for (const kind of ['model-matrix', 'legal-form-choice'] as const) {
      const ids = practicalSections(kind).map((section) => section.id);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });
});

describe('practicalXpChip', () => {
  it('names what the XP is given for', () => {
    expect(practicalXpChip('model-matrix')).toContain('матрицю');
    expect(practicalXpChip('legal-form-choice')).toContain('задачі');
  });
});

describe('condition notes', () => {
  it('counts the matrix cells and names the rubric criterion', () => {
    const note = matrixConditionNote({ features: 12, models: 4, cells: 48, rubricTitle: 'Матриця моделей' });
    expect(note).toContain('12 ознак × 4 моделі = 48 формулювань');
    expect(note).toContain('«Матриця моделей»');
  });

  it('counts the pairs of dates of the registry series', () => {
    const note = legalFormConditionNote({ criteria: 5, forms: 4, points: 8, registryForms: 3 });
    expect(note).toContain('5 параметрів стартапу');
    expect(note).toContain('4 форми на вибір');
    expect(note).toContain('8 дат ряду ЄДРПОУ');
    expect(note).toContain('84 можливих варіантів');
  });

  it('uses Ukrainian plural forms for a single parameter and two dates', () => {
    const note = legalFormConditionNote({ criteria: 1, forms: 2, points: 2, registryForms: 1 });
    expect(note).toContain('1 параметр стартапу');
    expect(note).toContain('2 форми на вибір');
    expect(note).toContain('2 дати ряду ЄДРПОУ');
    expect(note).toContain('1 можливих варіантів');
  });
});
