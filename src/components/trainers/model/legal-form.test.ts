import { describe, expect, it } from 'vitest';
import { SERIES } from '../../../engines/legal-form/__fixtures__/choice';
import { registryChange } from '../../../engines/legal-form';
import { createSeededRandom } from '../../../engines/shared/random';
import { EMPTY_DYNAMICS_ANSWER, checkDynamicsAnswer, createLegalFormVariant, dynamicsSolution, ratePercent, trendText } from './legal-form';

const variant = (formKey: string, from: string, to: string) => {
  const change = registryChange(SERIES, formKey, from, to);
  if (!change.ok) throw new Error(change.error.message);
  return { variantId: 'test', change: change.value };
};

const atFall = variant('at', '2020-01-01', '2026-01-01');
const tovRise = variant('tov', '2020-01-01', '2021-01-01');

describe('checkDynamicsAnswer', () => {
  it('accepts an answer rounded to hundredths of a percentage point', () => {
    const result = checkDynamicsAnswer(atFall, { absoluteChange: '-451', growthRate: '-3,24', splitComparable: 'no' });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.solved).toBe(true);
  });

  it('rejects the wrong sign of the absolute change and shows the right value', () => {
    const result = checkDynamicsAnswer(atFall, { absoluteChange: '451', growthRate: '-3,24', splitComparable: 'no' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.solved).toBe(false);
    expect(result.value.parts[0]).toMatchObject({ correct: false, expected: '−451' });
  });

  it('rejects a rate that misses the tolerance', () => {
    const result = checkDynamicsAnswer(atFall, { absoluteChange: '-451', growthRate: '-3,2', splitComparable: 'no' });
    if (!result.ok) throw new Error('очікувався розбір');
    expect(result.value.parts[1]?.correct).toBe(false);
  });

  it('checks the comparability question separately', () => {
    const result = checkDynamicsAnswer(tovRise, { absoluteChange: '32966', growthRate: '4,89', splitComparable: 'yes' });
    if (!result.ok) throw new Error('очікувався розбір');
    expect(result.value.parts.map((part) => part.correct)).toEqual([true, true, true]);
  });

  it('returns field issues for an empty answer', () => {
    const result = checkDynamicsAnswer(atFall, EMPTY_DYNAMICS_ANSWER);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.map((issue) => issue.field)).toEqual(['absoluteChange', 'growthRate', 'splitComparable']);
  });
});

describe('dynamicsSolution', () => {
  it('walks through both rates and explains why the split cannot be compared', () => {
    const steps = dynamicsSolution(atFall);
    expect(steps).toHaveLength(5);
    expect(steps[1]).toContain('−451');
    expect(steps[3]).toContain('кількість зменшилася');
    expect(steps[4]).toContain('різних поколінь');
  });

  it('says that the split is comparable inside one generation', () => {
    expect(dynamicsSolution(tovRise).at(-1)).toContain('одного покоління');
  });
});

describe('helpers', () => {
  it('scales a rate to percentage points', () => {
    expect(ratePercent(0.240608)).toBeCloseTo(24.0608, 4);
  });

  it('names the direction of the trend', () => {
    expect(trendText(atFall.change)).toBe('кількість зменшилася');
    expect(trendText(tovRise.change)).toBe('кількість зросла');
    expect(trendText({ ...atFall.change, rates: { ...atFall.change.rates, absoluteChange: 0 } })).toBe('кількість не змінилася');
  });

  it('builds a variant factory bound to the series', () => {
    const create = createLegalFormVariant(SERIES);
    expect(create(createSeededRandom('seed')).variantId).toBe(create(createSeededRandom('seed')).variantId);
  });
});
