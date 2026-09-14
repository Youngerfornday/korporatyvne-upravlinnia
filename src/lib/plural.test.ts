import { describe, expect, it } from 'vitest';
import { pluralUk } from './plural';

const CREDITS = { one: 'кредит', few: 'кредити', many: 'кредитів', other: 'кредиту' } as const;

describe('pluralUk', () => {
  it.each([
    [1, '1 кредит'],
    [2, '2 кредити'],
    [4, '4 кредити'],
    [5, '5 кредитів'],
    [11, '11 кредитів'],
    [21, '21 кредит'],
    [120, '120 кредитів'],
  ])('formats %i as «%s»', (count, expected) => {
    expect(pluralUk(count, CREDITS)).toBe(expected);
  });

  it('uses the few form for fractional values, as Ukrainian grammar requires', () => {
    expect(pluralUk(1.5, CREDITS)).toBe('1,5 кредиту');
  });
});
