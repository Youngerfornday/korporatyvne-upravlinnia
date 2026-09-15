import { describe, expect, it } from 'vitest';
import { toleranceInterval, withinTolerance } from './tolerance';

describe('toleranceInterval (port of qtype_numerical_answer::get_tolerance_interval)', () => {
  it('nominal: answer ± tolerance, widened by a tiny epsilon (MDL-3225)', () => {
    const [min, max] = toleranceInterval(32.5, 0.01, 'nominal');
    expect(min).toBeCloseTo(32.49, 12);
    expect(max).toBeCloseTo(32.51, 12);
    expect(max).toBeGreaterThan(32.51);
  });

  it('relative: answer ± |answer| × tolerance', () => {
    const [min, max] = toleranceInterval(200, 0.01, 'relative');
    expect(min).toBeCloseTo(198, 10);
    expect(max).toBeCloseTo(202, 10);
  });

  it('geometric: answer ÷ (1 + tolerance) … answer × (1 + tolerance), flipped for negatives', () => {
    const [min, max] = toleranceInterval(100, 0.25, 'geometric');
    expect(min).toBeCloseTo(80, 10);
    expect(max).toBeCloseTo(125, 10);
    const [negMin, negMax] = toleranceInterval(-100, 0.25, 'geometric');
    expect(negMin).toBeCloseTo(-125, 10);
    expect(negMax).toBeCloseTo(-80, 10);
  });
});

describe('withinTolerance', () => {
  it('accepts values that equal the answer after binary rounding', () => {
    expect(withinTolerance(0.1 + 0.2, 0.3, 0, 'nominal')).toBe(true);
  });

  it('includes both ends and rejects values outside', () => {
    expect(withinTolerance(32.51, 32.5, 0.01, 'nominal')).toBe(true);
    expect(withinTolerance(32.52, 32.5, 0.01, 'nominal')).toBe(false);
    expect(withinTolerance(202, 200, 0.01, 'relative')).toBe(true);
    expect(withinTolerance(202.1, 200, 0.01, 'relative')).toBe(false);
  });
});
