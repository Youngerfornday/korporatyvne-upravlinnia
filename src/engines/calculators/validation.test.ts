import { describe, expect, it } from 'vitest';
import { expectValid, firstError, nonNegativeInteger, parseCalculatorInput, positiveInteger, positiveNumber, share, finiteNumber, nonNegativeNumber } from './validation';

const FIELD = { field: 'netProfit', label: 'Чистий прибуток' } as const;

describe('field validators', () => {
  it('return null for valid values', () => {
    expect(finiteNumber(-3.5, FIELD)).toBeNull();
    expect(nonNegativeNumber(0, FIELD)).toBeNull();
    expect(positiveNumber(0.01, FIELD)).toBeNull();
    expect(nonNegativeInteger(0, FIELD)).toBeNull();
    expect(positiveInteger(7, FIELD)).toBeNull();
    expect(share(1, FIELD)).toBeNull();
  });

  it.each([
    ['finiteNumber', () => finiteNumber(Number.NaN, FIELD), 'not-finite'],
    ['finiteNumber', () => finiteNumber(Infinity, FIELD), 'not-finite'],
    ['nonNegativeNumber', () => nonNegativeNumber(-1, FIELD), 'negative'],
    ['positiveNumber', () => positiveNumber(0, FIELD), 'not-positive'],
    ['nonNegativeInteger', () => nonNegativeInteger(1.5, FIELD), 'not-integer'],
    ['positiveInteger', () => positiveInteger(0, FIELD), 'not-positive'],
    ['positiveInteger', () => positiveInteger(2 ** 60, FIELD), 'out-of-range'],
    ['share', () => share(1.01, FIELD), 'out-of-range'],
    ['share', () => share(-0.1, FIELD), 'out-of-range'],
  ])('%s reports %s', (_name, check, code) => {
    const error = check();
    expect(error).toMatchObject({ code, field: 'netProfit' });
    expect(error?.message).toContain('«Чистий прибуток»');
  });

  it('firstError picks the first problem', () => {
    expect(firstError(null, positiveNumber(0, FIELD), finiteNumber(Number.NaN, FIELD))?.code).toBe('not-positive');
    expect(firstError(null, null)).toBeNull();
  });
});

describe('parseCalculatorInput', () => {
  it.each([[' '], ['\u00A0'], ['\u202F']])('reads Ukrainian decimal input with «%s» between thousands', (separator) => {
    expect(parseCalculatorInput(`1${separator}250,5`, FIELD)).toEqual({ ok: true, value: 1250.5 });
  });

  it('returns a typed Ukrainian error for text that is not a number', () => {
    expect(parseCalculatorInput('багато', FIELD)).toMatchObject({
      ok: false,
      error: { code: 'not-finite', field: 'netProfit', message: expect.stringContaining('1,5') },
    });
  });
});

describe('expectValid', () => {
  it('returns the value of a successful result and throws on an error', () => {
    expect(expectValid({ ok: true, value: 5 })).toBe(5);
    expect(() => expectValid({ ok: false, error: { code: 'negative', field: 'x', message: 'Погано.' } })).toThrow(/Погано/);
  });
});
