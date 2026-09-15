import { describe, expect, it } from 'vitest';
import { SECURITIES_CASES as C } from './__fixtures__/reference-cases';
import { bondPrice, currentYield, discountYield, dividendYield, earningsPerShare, priceToEarnings, yieldToMaturity } from './securities';

function value<T>(result: { ok: true; value: T } | { ok: false; error: { message: string } }): T {
  if (!result.ok) throw new Error(result.error.message);
  return result.value;
}

describe('securities — reference cases', () => {
  it('EPS, P/E and dividend yield', () => {
    expect(value(earningsPerShare(C.eps.input))).toBeCloseTo(C.eps.expected, 12);
    expect(value(priceToEarnings(C.priceEarnings.input))).toBeCloseTo(C.priceEarnings.expected, 12);
    expect(value(dividendYield(C.dividendYield.input))).toBeCloseTo(C.dividendYield.expected, 12);
  });

  it('bond prices with annual and semiannual coupons', () => {
    expect(value(bondPrice(C.bondAnnual.input))).toBeCloseTo(C.bondAnnual.expected, 9);
    expect(value(bondPrice(C.bondSemiannual.input))).toBeCloseTo(C.bondSemiannual.expected, 9);
  });

  it('current yield and yield to maturity', () => {
    expect(value(currentYield(C.currentYield.input))).toBeCloseTo(C.currentYield.expected, 12);
    const ytm = value(yieldToMaturity(C.yieldToMaturity.input));
    expect(ytm.annualYield).toBeCloseTo(C.yieldToMaturity.expected, 9);
    expect(ytm.iterations).toBeGreaterThan(0);
  });

  it('discount security yields', () => {
    const result = value(discountYield(C.discount.input));
    expect(result.discountRate).toBeCloseTo(C.discount.expected.discountRate, 12);
    expect(result.investmentYield).toBeCloseTo(C.discount.expected.investmentYield, 12);
  });
});

describe('securities — edge cases', () => {
  it('EPS defaults preferred dividends to zero', () => {
    expect(value(earningsPerShare({ netIncome: 1_000, weightedCommonShares: 400 }))).toBe(2.5);
  });

  it('P/E is undefined for zero or negative earnings', () => {
    expect(priceToEarnings({ price: 45, eps: 0 })).toMatchObject({ ok: false, error: { code: 'undefined-ratio' } });
    expect(priceToEarnings({ price: 45, eps: -1 })).toMatchObject({ ok: false, error: { code: 'undefined-ratio' } });
  });

  it('prices a bond at par when the market rate equals the coupon, and handles a zero rate', () => {
    expect(value(bondPrice({ faceValue: 1_000, couponRate: 0.1, yearsToMaturity: 5, marketRate: 0.1 }))).toBeCloseTo(1_000, 9);
    expect(value(bondPrice({ faceValue: 1_000, couponRate: 0.1, yearsToMaturity: 2, marketRate: 0 }))).toBeCloseTo(1_200, 9);
  });

  it('finds premium and negative yields to maturity', () => {
    const premium = value(yieldToMaturity({ price: 1_075.8157353881686, faceValue: 1_000, couponRate: 0.12, yearsToMaturity: 5 }));
    expect(premium.annualYield).toBeCloseTo(0.1, 9);
    const negative = value(yieldToMaturity({ price: 1_250, faceValue: 1_000, couponRate: 0.1, yearsToMaturity: 2 }));
    expect(negative.annualYield).toBeLessThan(0);
    const semi = value(yieldToMaturity({ price: 964.5404949583763, faceValue: 1_000, couponRate: 0.08, yearsToMaturity: 2, periodsPerYear: 2 }));
    expect(semi.annualYield).toBeCloseTo(0.1, 9);
    expect(semi.periodicYield).toBeCloseTo(0.05, 9);
  });

  it('stops after the iteration limit with a typed error', () => {
    expect(yieldToMaturity({ price: 951.96, faceValue: 1_000, couponRate: 0.1, yearsToMaturity: 3 }, { maxIterations: 3 })).toMatchObject({
      ok: false,
      error: { code: 'no-convergence' },
    });
  });

  it('reports a price no yield can explain', () => {
    expect(yieldToMaturity({ price: 1e12, faceValue: 1_000, couponRate: 0.1, yearsToMaturity: 3 })).toMatchObject({
      ok: false,
      error: { code: 'no-convergence' },
    });
  });

  it.each([
    [() => bondPrice({ faceValue: 1_000, couponRate: 0.1, yearsToMaturity: 1.25, marketRate: 0.1, periodsPerYear: 2 }), 'not-integer'],
    [() => bondPrice({ faceValue: 0, couponRate: 0.1, yearsToMaturity: 1, marketRate: 0.1 }), 'not-positive'],
    [() => bondPrice({ faceValue: 1_000, couponRate: -0.1, yearsToMaturity: 1, marketRate: 0.1 }), 'negative'],
    [() => bondPrice({ faceValue: 1_000, couponRate: 0.1, yearsToMaturity: 1, marketRate: -1 }), 'out-of-range'],
    [() => bondPrice({ faceValue: 1_000, couponRate: 0.1, yearsToMaturity: 1, marketRate: 0.1, periodsPerYear: 3 }), 'out-of-range'],
    [() => currentYield({ faceValue: 1_000, couponRate: 0.1, price: 0 }), 'not-positive'],
    [() => dividendYield({ dividendPerShare: -1, price: 10 }), 'negative'],
    [() => earningsPerShare({ netIncome: 1, weightedCommonShares: 0 }), 'not-positive'],
    [() => discountYield({ faceValue: 1_000, price: 1_001, daysToMaturity: 91 }), 'inconsistent'],
    [() => discountYield({ faceValue: 1_000, price: 990, daysToMaturity: 0 }), 'not-positive'],
    [() => yieldToMaturity({ price: -5, faceValue: 1_000, couponRate: 0.1, yearsToMaturity: 3 }), 'not-positive'],
  ])('validates input (%#)', (run, code) => {
    expect(run()).toMatchObject({ ok: false, error: { code } });
  });
});
