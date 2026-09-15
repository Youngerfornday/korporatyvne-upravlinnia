import { describe, expect, it } from 'vitest';
import { createSeededRandom, pickOne, randomInt, shuffled } from './random';

function take(count: number, seed: number | string): number[] {
  const random = createSeededRandom(seed);
  return Array.from({ length: count }, () => random.next());
}

describe('createSeededRandom', () => {
  it('produces the same sequence for the same seed', () => {
    expect(take(5, 42)).toEqual(take(5, 42));
    expect(take(5, 'attempt-1')).toEqual(take(5, 'attempt-1'));
  });

  it('produces different sequences for different seeds', () => {
    expect(take(5, 1)).not.toEqual(take(5, 2));
    expect(take(5, 'a')).not.toEqual(take(5, 'b'));
  });

  it('returns values in the half-open range [0, 1)', () => {
    const values = take(2000, 'range');
    expect(values.every((value) => value >= 0 && value < 1)).toBe(true);
  });

  it('spreads values roughly uniformly', () => {
    // Arrange
    const values = take(10_000, 7);

    // Act
    const lowerHalf = values.filter((value) => value < 0.5).length;

    // Assert
    expect(lowerHalf).toBeGreaterThan(4700);
    expect(lowerHalf).toBeLessThan(5300);
  });
});

describe('randomInt', () => {
  it('stays within inclusive bounds and hits both ends', () => {
    // Arrange
    const random = createSeededRandom('int');

    // Act
    const values = Array.from({ length: 500 }, () => randomInt(random, 3, 6));

    // Assert
    expect(Math.min(...values)).toBe(3);
    expect(Math.max(...values)).toBe(6);
    expect(values.every(Number.isInteger)).toBe(true);
  });

  it('rejects inverted or fractional bounds', () => {
    const random = createSeededRandom(1);
    expect(() => randomInt(random, 5, 1)).toThrow(RangeError);
    expect(() => randomInt(random, 0.5, 2)).toThrow(RangeError);
  });
});

describe('shuffled', () => {
  it('returns a permutation without mutating the input', () => {
    // Arrange
    const items = Object.freeze([1, 2, 3, 4, 5, 6, 7, 8]);

    // Act
    const result = shuffled(items, createSeededRandom('perm'));

    // Assert
    expect([...result].sort((a, b) => a - b)).toEqual([...items]);
    expect(items).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it('is deterministic for a seed and actually reorders', () => {
    const items = Array.from({ length: 20 }, (_, index) => index);
    const first = shuffled(items, createSeededRandom('same'));
    expect(shuffled(items, createSeededRandom('same'))).toEqual(first);
    expect(first).not.toEqual(items);
  });
});

describe('pickOne', () => {
  it('picks an element of the array', () => {
    const random = createSeededRandom(3);
    const items = ['a', 'b', 'c'] as const;
    expect(items).toContain(pickOne(items, random));
  });

  it('throws on an empty array', () => {
    expect(() => pickOne([], createSeededRandom(3))).toThrow(RangeError);
  });
});
