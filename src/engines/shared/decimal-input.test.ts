import { describe, expect, it } from 'vitest';
import { parseDecimalInput, parseMoodleNumber } from './decimal-input';

describe('parseMoodleNumber (port of qtype_numerical_answer_processor::apply_units)', () => {
  it.each([
    ['1.5', 1.5],
    ['1,5', 1.5],
    ['-0,25', -0.25],
    ['+3', 3],
    ['.5', 0.5],
    ['5.', 5],
    ['1 234,5', 1234.5],
    ['1 234 567', 1234567],
    ['1,234.5', 1234.5],
    ['2,456,789', 2456789],
    ['1,234', 1.234],
    ['1.5e3', 1500],
    ['1,5E-2', 0.015],
    ['1.5x10^3', 1500],
    ['2*10**2', 200],
    ['3×10^2', 300],
  ])('reads «%s» as %d', (input, expected) => {
    expect(parseMoodleNumber(input)).toEqual({ value: expected, rest: '' });
  });

  it('strips no-break and narrow spaces used by uk-UA number formatting', () => {
    expect(parseMoodleNumber('650\u00A0000').value).toBe(650000);
    expect(parseMoodleNumber('1\u202F200,5').value).toBe(1200.5);
  });

  it.each([
    ['regular space', ' '],
    ['no-break space U+00A0', '\u00A0'],
    ['narrow no-break space U+202F', '\u202F'],
    ['thin space U+2009', '\u2009'],
  ])('reads «1 234,5» with a %s as the thousands separator', (_label, separator) => {
    expect(parseMoodleNumber(`1${separator}234,5`)).toEqual({ value: 1234.5, rest: '' });
    expect(parseDecimalInput(`1${separator}234${separator}567,25`)).toBe(1234567.25);
  });

  it('reads numbers formatted by Intl.NumberFormat uk-UA back exactly', () => {
    const formatted = new Intl.NumberFormat('uk-UA', { maximumFractionDigits: 2 }).format(1234567.89);
    expect(parseDecimalInput(formatted)).toBe(1234567.89);
  });

  it('keeps trailing text as the unit part, like Moodle', () => {
    expect(parseMoodleNumber('32,5грн')).toEqual({ value: 32.5, rest: 'грн' });
  });

  it.each([[''], ['   '], ['abc'], ['-'], [','], ['e5']])('returns null for «%s»', (input) => {
    expect(parseMoodleNumber(input).value).toBeNull();
  });
});

describe('parseDecimalInput', () => {
  it('accepts a clean decimal written either way', () => {
    expect(parseDecimalInput('1,5')).toBe(1.5);
    expect(parseDecimalInput(' 1 500 ')).toBe(1500);
  });

  it('rejects trailing text, empty input and non-finite numbers', () => {
    expect(parseDecimalInput('12 шт')).toBeNull();
    expect(parseDecimalInput('')).toBeNull();
    expect(parseDecimalInput('1e999')).toBeNull();
  });
});
