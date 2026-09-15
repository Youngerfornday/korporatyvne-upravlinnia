import { describe, expect, it } from 'vitest';
import { evaluateFormula, validateFormula } from './formula';

function value(formula: string, values: Record<string, number> = {}): number {
  const result = evaluateFormula(formula, values);
  if (!result.ok) throw new Error(`${result.error.code}: ${result.error.message}`);
  return result.value;
}

function errorCode(formula: string, values: Record<string, number> = {}): string | null {
  const result = evaluateFormula(formula, values);
  return result.ok ? null : result.error.code;
}

describe('evaluateFormula: arithmetic with PHP precedence', () => {
  it.each([
    ['1 + 2 * 3', 7],
    ['(1 + 2) * 3', 9],
    ['10 / 4', 2.5],
    ['10 - 4 - 3', 3],
    ['2 ** 3 ** 2', 512],
    ['-2 ** 2', -4],
    ['2 ** -1', 0.5],
    ['--3', 3],
    ['+4 - -1', 5],
    ['7 % 3', 1],
    ['-7 % 3', -1],
    ['7.9 % 3.2', 1],
    ['1.5e3 + .5', 1500.5],
    ['1.', 1],
  ])('%s = %d', (formula, expected) => {
    expect(value(formula)).toBe(expected);
  });

  it('substitutes {placeholders} as parenthesised values', () => {
    expect(value('{p} * {r} / 100 / {n}', { p: 650, r: 50, n: 10 })).toBe(32.5);
    expect(value('-{a} ** 2', { a: 3 })).toBe(-9);
    expect(value('{a} ** 2', { a: -3 })).toBe(9);
  });
});

describe('evaluateFormula: Moodle function allowlist', () => {
  it.each([
    ['abs(-2)', 2],
    ['sqrt(16)', 4],
    ['pow(2, 10)', 1024],
    ['max(1, 7, 3)', 7],
    ['min(4, 2)', 2],
    ['round(2.5)', 3],
    ['round(-2.5)', -3],
    ['round(1.005, 2)', 1.01],
    ['round(1234.5, -2)', 1200],
    ['floor(-1.5)', -2],
    ['ceil(1.2)', 2],
    ['fmod(7.5, 2)', 1.5],
    ['log(exp(2))', 2],
    ['log(8, 2)', 3],
    ['log10(1000)', 3],
    ['atan2(1, 1) * 4', Math.PI],
    ['pi()', Math.PI],
    ['deg2rad(180)', Math.PI],
    ['rad2deg(pi())', 180],
    ['decbin(5)', 101],
    ['bindec(101)', 5],
    ['decoct(8)', 10],
    ['octdec(17)', 15],
    ['is_nan(sqrt(-1))', 1],
    ['is_finite(1)', 1],
    ['is_infinite(1)', 0],
    ['SQRT(9)', 3],
    ['expm1(0) + log1p(0)', 0],
  ])('%s = %d', (formula, expected) => {
    expect(value(formula)).toBeCloseTo(expected, 12);
  });

  it('evaluates the remaining trigonometric and hyperbolic functions', () => {
    const names = ['sin', 'cos', 'tan', 'asin', 'acos', 'atan', 'sinh', 'cosh', 'tanh', 'asinh', 'atanh'];
    for (const name of names) {
      expect(Number.isFinite(value(`${name}(0.5)`))).toBe(true);
    }
    expect(value('acosh(1)')).toBe(0);
  });

  it('handles negative numbers in decbin like 64-bit PHP', () => {
    expect(value('decbin(-1)')).toBeGreaterThan(1e63);
  });
});

describe('evaluateFormula: errors instead of NaN or exceptions', () => {
  it.each([
    ['1 / 0', 'division-by-zero'],
    ['5 % 0.4', 'division-by-zero'],
    ['sqrt(-1)', 'not-finite'],
    ['pow(0, -1)', 'not-finite'],
    ['{missing} + 1', 'unknown-variable'],
  ])('%s → %s', (formula, code) => {
    expect(errorCode(formula)).toBe(code);
  });
});

describe('validateFormula', () => {
  it('accepts a valid formula and lists its placeholders once each', () => {
    const result = validateFormula('{p} * {r} / 100 / {n} + {p}');
    expect(result).toEqual({ ok: true, value: { placeholders: ['p', 'r', 'n'] } });
  });

  it.each([
    ['{p}*/2', 'syntax'],
    ['1 +', 'syntax'],
    ['(1 + 2', 'syntax'],
    ['1 + 2)', 'syntax'],
    ['()', 'syntax'],
    ['2 ^ 3', 'syntax'],
    ['{a}{b}', 'syntax'],
    ['a + 1', 'syntax'],
    ['1 // 2', 'syntax'],
    ['system(1)', 'unknown-function'],
    ['constructor(1)', 'unknown-function'],
    ['sqrt(1, 2)', 'wrong-arity'],
    ['pi(1)', 'wrong-arity'],
    ['pow(2)', 'wrong-arity'],
    ['max(1)', 'wrong-arity'],
    ['round(1, 2, 3)', 'wrong-arity'],
    ['sqrt()', 'wrong-arity'],
    ['min(1,)', 'syntax'],
    ['', 'syntax'],
  ])('rejects «%s» as %s', (formula, code) => {
    const result = validateFormula(formula);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe(code);
      expect(result.error.message.length).toBeGreaterThan(0);
    }
  });

  it('reports placeholders that are not in the allowed variable list', () => {
    const result = validateFormula('{p} + {q}', { variables: ['p'] });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatchObject({ code: 'unknown-variable', message: expect.stringContaining('{q}') });
  });

  it('limits formula length and nesting depth', () => {
    expect(validateFormula(`1${' + 1'.repeat(600)}`)).toMatchObject({ ok: false, error: { code: 'too-long' } });
    expect(validateFormula(`${'('.repeat(150)}1${')'.repeat(150)}`)).toMatchObject({ ok: false, error: { code: 'too-deep' } });
  });

  it('rejects ^ with an explanation that Moodle has no such power operator', () => {
    for (const formula of ['{a} ^ 2', '2^3']) {
      const result = validateFormula(formula);
      expect(result).toMatchObject({ ok: false, error: { code: 'syntax', message: expect.stringContaining('pow(') } });
    }
    expect(evaluateFormula('{a} ^ 2', { a: 3 })).toMatchObject({ ok: false, error: { code: 'syntax', message: expect.stringContaining('XOR') } });
  });

  it('points at the position of a syntax error', () => {
    const result = validateFormula('1 + $');
    expect(result).toMatchObject({ ok: false, error: { code: 'syntax', position: 4 } });
  });
});
