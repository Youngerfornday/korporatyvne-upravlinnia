import { describe, expect, it } from 'vitest';
import { PROFIT_CASES } from './__fixtures__/reference-cases';
import { DEFAULT_NET_ASSETS_RULE, distributeProfit, type ProfitDistributionInput } from './profit-distribution';

function expectClose(actual: unknown, expected: unknown): void {
  if (typeof expected === 'number') {
    expect(actual).toBeCloseTo(expected, 6);
    return;
  }
  if (Array.isArray(expected)) {
    expect(Array.isArray(actual)).toBe(true);
    expected.forEach((item, index) => expectClose((actual as unknown[])[index], item));
    return;
  }
  if (expected !== null && typeof expected === 'object') {
    for (const [key, value] of Object.entries(expected)) expectClose((actual as Record<string, unknown>)[key], value);
    return;
  }
  expect(actual).toEqual(expected);
}

describe('distributeProfit — reference cases', () => {
  it.each(PROFIT_CASES)('$id', ({ input, expected }) => {
    const result = distributeProfit(input as ProfitDistributionInput);
    expect(result.ok).toBe(true);
    if (result.ok) expectClose(result.value, expected);
  });
});

describe('distributeProfit — behaviour', () => {
  const base: ProfitDistributionInput = {
    netProfit: 1_000_000,
    reserveRate: 0.1,
    preferredShares: 0,
    preferredDividendPerShare: 0,
    commonShares: 100_000,
    commonPayoutRatio: 0.5,
  };

  it('uses the ст. 35 net assets rule by default and lets it be configured', () => {
    expect(DEFAULT_NET_ASSETS_RULE).toEqual({ includeReserveCapital: true, includePreferredLiquidationExcess: true });
    // Після виплати 450 000: 10 500 000 − 450 000 = 10 050 000 — нижче 10 100 000, але вище 10 000 000.
    const netAssets = { equityBeforeDividends: 10_500_000, statutoryCapital: 10_000_000, reserveCapitalAfter: 100_000 };
    const strict = distributeProfit({ ...base, netAssets });
    const statutoryOnly = distributeProfit({ ...base, netAssets, netAssetsRule: { includeReserveCapital: false, includePreferredLiquidationExcess: false } });
    expect(strict.ok && strict.value.netAssetsCheck).toMatchObject({ minimumEquity: 10_100_000, compliant: false });
    expect(statutoryOnly.ok && statutoryOnly.value.netAssetsCheck).toMatchObject({ minimumEquity: 10_000_000, compliant: true });
  });

  it('skips the net assets check when no balance data is given', () => {
    const result = distributeProfit(base);
    expect(result.ok && result.value.netAssetsCheck).toBeNull();
    expect(result.ok && result.value.holders).toEqual([]);
  });

  it('reports zero shares of dividends when nothing is paid', () => {
    const result = distributeProfit({ ...base, commonPayoutRatio: 0, holders: [{ id: 'a', label: 'А', commonShares: 10 }] });
    expect(result.ok && result.value.holders).toEqual([{ id: 'a', label: 'А', amount: 0, shareOfDividends: 0 }]);
    expect(result.ok && result.value.payoutRatio).toBe(0);
  });

  it.each([
    [{ netProfit: 0 }, 'not-positive', 'netProfit'],
    [{ reserveRate: 1.2 }, 'out-of-range', 'reserveRate'],
    [{ commonShares: 0 }, 'not-positive', 'commonShares'],
    [{ preferredShares: 1.5 }, 'not-integer', 'preferredShares'],
    [{ preferredDividendPerShare: -1 }, 'negative', 'preferredDividendPerShare'],
    [{ commonPayoutRatio: Number.NaN }, 'not-finite', 'commonPayoutRatio'],
    [{ holders: [{ id: 'x', label: 'X', commonShares: 100_001 }] }, 'inconsistent', 'holders'],
    [{ holders: [{ id: 'x', label: 'X', commonShares: 1, preferredShares: 1 }] }, 'inconsistent', 'holders'],
    [{ netAssets: { equityBeforeDividends: Number.NaN, statutoryCapital: 1 } }, 'not-finite', 'equityBeforeDividends'],
  ])('rejects %o', (patch, code, field) => {
    expect(distributeProfit({ ...base, ...patch } as ProfitDistributionInput)).toMatchObject({ ok: false, error: { code, field } });
  });
});
