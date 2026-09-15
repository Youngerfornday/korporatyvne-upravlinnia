import { describe, expect, it } from 'vitest';
import { DUPONT_CASES, GROWTH_CASES } from './__fixtures__/reference-cases';
import { compareGrowth, dupontAnalysis, growthRates } from './dupont';

describe('dupontAnalysis — reference cases', () => {
  it.each(DUPONT_CASES)('$id', ({ input, expected }) => {
    const result = dupontAnalysis(input);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    for (const [key, value] of Object.entries(expected)) {
      expect(result.value[key as keyof typeof result.value]).toBeCloseTo(value, 12);
    }
  });

  it('keeps the identities ROA = ROS × turnover and ROE = ROA × multiplier for a loss', () => {
    const result = dupontAnalysis({ revenue: 20_000_000, netIncome: -1_000_000, averageAssets: 25_000_000, averageEquity: 5_000_000 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.returnOnAssets).toBeCloseTo(-0.04, 12);
    expect(result.value.returnOnEquity).toBeCloseTo(-0.2, 12);
  });

  it.each([
    [{ revenue: 0, netIncome: 1, averageAssets: 1, averageEquity: 1 }, 'not-positive', 'revenue'],
    [{ revenue: 1, netIncome: Number.NaN, averageAssets: 1, averageEquity: 1 }, 'not-finite', 'netIncome'],
    [{ revenue: 1, netIncome: 1, averageAssets: 1, averageEquity: -5 }, 'not-positive', 'averageEquity'],
    [{ revenue: 1, netIncome: 1, averageAssets: 10, averageEquity: 11 }, 'inconsistent', 'averageEquity'],
  ])('rejects %o', (input, code, field) => {
    expect(dupontAnalysis(input)).toMatchObject({ ok: false, error: { code, field } });
  });
});

describe('growthRates and compareGrowth — reference cases', () => {
  it.each(GROWTH_CASES)('$id', ({ input, expected }) => {
    const result = compareGrowth(input);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.costGrowsFaster).toBe(expected.costGrowsFaster);
    expect(result.value.gapPercentagePoints).toBeCloseTo(expected.gapPercentagePoints, 10);
    for (const series of ['revenue', 'cost'] as const) {
      for (const [key, value] of Object.entries(expected[series])) {
        expect(result.value[series][key as keyof (typeof result.value)['revenue']]).toBeCloseTo(value, 10);
      }
    }
  });

  it('requires a positive base period', () => {
    expect(growthRates({ previous: 0, current: 5 }, 'Виручка')).toMatchObject({ ok: false, error: { code: 'not-positive', field: 'previous' } });
    expect(compareGrowth({ revenue: { previous: 1, current: 1 }, cost: { previous: -1, current: 1 } })).toMatchObject({
      ok: false,
      error: { message: expect.stringContaining('Собівартість') },
    });
  });
});
