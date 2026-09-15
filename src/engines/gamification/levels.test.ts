import { describe, expect, it } from 'vitest';
import { LEVELS, levelForXp, levelProgress } from './levels';

describe('LEVELS', () => {
  it('follows the career ladder and thresholds from DESIGN.md', () => {
    expect(LEVELS.map((level) => [level.title, level.minXp])).toEqual([
      ['Акціонер', 0],
      ['Міноритарій', 500],
      ['Член наглядової ради', 1200],
      ['Незалежний директор', 2200],
      ['Голова ради', 3400],
    ]);
    expect(LEVELS.map((level) => level.id)).toEqual(['shareholder', 'minority', 'board-member', 'independent-director', 'chair']);
  });
});

describe('levelForXp', () => {
  it.each([
    [0, 'Акціонер'],
    [499, 'Акціонер'],
    [500, 'Міноритарій'],
    [1199, 'Міноритарій'],
    [1200, 'Член наглядової ради'],
    [2200, 'Незалежний директор'],
    [3400, 'Голова ради'],
    [99_999, 'Голова ради'],
  ])('%i XP → %s', (xp, title) => {
    expect(levelForXp(xp).title).toBe(title);
  });

  it('treats negative or broken XP as zero', () => {
    expect(levelForXp(-5).title).toBe('Акціонер');
    expect(levelForXp(Number.NaN).title).toBe('Акціонер');
  });
});

describe('levelProgress', () => {
  it('matches the profile mockup: 640 XP is 20% of the way to 1 200', () => {
    expect(levelProgress(640)).toEqual({
      level: LEVELS[1],
      position: 2,
      total: 5,
      next: LEVELS[2],
      xpIntoLevel: 140,
      xpForNextLevel: 700,
      xpRemaining: 560,
      ratio: 0.2,
    });
  });

  it('is complete at the top level', () => {
    expect(levelProgress(4000)).toMatchObject({ position: 5, next: null, xpRemaining: 0, ratio: 1 });
  });
});
