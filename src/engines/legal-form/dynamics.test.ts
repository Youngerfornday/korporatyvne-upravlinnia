import { describe, expect, it } from 'vitest';
import { createSeededRandom } from '../shared/random';
import { SERIES } from './__fixtures__/choice';
import { createDynamicsVariant, dynamicsVariantId, registryChange, registryForm } from './dynamics';
import { legalFormActivityId } from './events';

const change = (formKey: string, from: string, to: string) => {
  const result = registryChange(SERIES, formKey, from, to);
  if (!result.ok) throw new Error(result.error.message);
  return result.value;
};

describe('registryChange', () => {
  it('counts the fall of joint-stock companies from 2020 to 2026', () => {
    const result = change('at', '2020-01-01', '2026-01-01');
    expect(result.rates.absoluteChange).toBe(-451);
    expect(result.rates.growthRate).toBeCloseTo(-0.032441, 6);
    expect(result.rates.growthIndex).toBeCloseTo(0.967559, 6);
  });

  it('counts the growth of limited liability companies over the same period', () => {
    const result = change('tov', '2020-01-01', '2026-01-01');
    expect(result.rates.absoluteChange).toBe(162_275);
    expect(result.rates.growthRate).toBeCloseTo(0.240608, 6);
    expect(result.formTitle).toBe('Товариства з обмеженою відповідальністю');
  });

  it('allows the public/private split only inside one table generation', () => {
    expect(change('at', '2020-01-01', '2021-01-01').splitComparable).toBe(true);
    expect(change('at', '2021-01-01', '2026-01-01').splitComparable).toBe(false);
  });

  it('rejects an unknown form, an unknown date and a reversed pair', () => {
    expect(registryChange(SERIES, 'fop', '2020-01-01', '2026-01-01')).toMatchObject({ ok: false, error: { message: expect.stringContaining('fop') } });
    expect(registryChange(SERIES, 'at', '2019-01-01', '2026-01-01')).toMatchObject({ ok: false, error: { message: expect.stringContaining('2019-01-01') } });
    expect(registryChange(SERIES, 'at', '2026-01-01', '2020-01-01')).toMatchObject({ ok: false, error: { message: expect.stringContaining('раніша') } });
  });

  it('rejects a point without a number for the requested form', () => {
    const holes = { ...SERIES, points: SERIES.points.map((point) => ({ ...point, values: { tov: point.values['tov'] ?? 0 } })) };
    expect(registryChange(holes, 'at', '2020-01-01', '2026-01-01')).toMatchObject({ ok: false });
  });

  it('finds a form by key', () => {
    expect(registryForm(SERIES, 'tov')?.short).toBe('ТОВ');
    expect(registryForm(SERIES, 'ghost')).toBeUndefined();
  });
});

describe('createDynamicsVariant', () => {
  it('is reproducible from the seed and always moves forward in time', () => {
    for (let seed = 0; seed < 30; seed += 1) {
      const variant = createDynamicsVariant(createSeededRandom(`p02:${seed}`), SERIES);
      expect(variant.change.from.date < variant.change.to.date).toBe(true);
      expect(variant.variantId).toMatch(/^[a-z0-9]+(?:[-_][a-z0-9]+)*$/);
      expect(createDynamicsVariant(createSeededRandom(`p02:${seed}`), SERIES).variantId).toBe(variant.variantId);
    }
  });

  it('produces both comparable and incomparable date pairs across seeds', () => {
    const flags = new Set(Array.from({ length: 40 }, (_, seed) => createDynamicsVariant(createSeededRandom(`v${seed}`), SERIES).change.splitComparable));
    expect(flags).toEqual(new Set([true, false]));
  });

  it('refuses a series with a single date', () => {
    expect(() => createDynamicsVariant(createSeededRandom('x'), { ...SERIES, points: SERIES.points.slice(0, 1) })).toThrow(/дві дати/);
  });

  it('refuses a series whose numbers do not support the change', () => {
    const zero = { ...SERIES, points: SERIES.points.map((point) => ({ ...point, values: { at: 0, tov: 0 } })) };
    expect(() => createDynamicsVariant(createSeededRandom('x'), zero)).toThrow(/Некоректні дані ряду/);
  });

  it('builds an id that the gamification engine accepts', () => {
    expect(dynamicsVariantId('tov', '2020-01-01', '2026-07-01')).toBe('dynamics-tov-20200101-20260701');
  });
});

describe('legalFormActivityId', () => {
  it('derives the activity id from the practical id', () => {
    expect(legalFormActivityId('p02')).toBe('p02-legal-form');
    expect(() => legalFormActivityId('practical-2')).toThrow(/Некоректний ID/);
  });
});
