import { describe, expect, it } from 'vitest';
import { formatMoney, formatNumber, formatPercent, roundTo } from './number-format';

const NBSP = '\u00A0';

describe('formatNumber', () => {
  it('uses the uk-UA decimal comma and no-break space grouping', () => {
    expect(formatNumber(1234567.5)).toBe(`1${NBSP}234${NBSP}567,5`);
  });

  it('limits fraction digits when asked', () => {
    expect(formatNumber(2 / 3, { maximumFractionDigits: 2 })).toBe('0,67');
    expect(formatNumber(5, { minimumFractionDigits: 2, maximumFractionDigits: 2 })).toBe('5,00');
  });
});

describe('formatMoney', () => {
  it('shows two decimals and the hryvnia abbreviation', () => {
    expect(formatMoney(32.5)).toBe(`32,50${NBSP}грн`);
    expect(formatMoney(650000)).toBe(`650${NBSP}000,00${NBSP}грн`);
  });
});

describe('formatPercent', () => {
  it('formats a ratio as percent with a no-break space before the sign', () => {
    expect(formatPercent(0.125)).toBe(`12,5${NBSP}%`);
    expect(formatPercent(0.5, 0)).toBe(`50${NBSP}%`);
  });
});

describe('roundTo', () => {
  it('rounds half away from zero with protection from binary artefacts', () => {
    expect(roundTo(1.005, 2)).toBe(1.01);
    expect(roundTo(-2.5, 0)).toBe(-3);
    expect(roundTo(2.675, 2)).toBe(2.68);
    expect(roundTo(1234.5678, -2)).toBe(1200);
  });
});
