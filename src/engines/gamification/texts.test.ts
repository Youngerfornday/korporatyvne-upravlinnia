import { describe, expect, it } from 'vitest';
import { levelProgress } from './levels';
import {
  badgesEarnedText,
  eventOutcomeText,
  formatXp,
  levelPositionText,
  newBadgesText,
  nextLevelText,
  xpGainText,
} from './texts';
import { LEVELS } from './levels';

const NBSP = '\u00A0';

describe('gamification texts', () => {
  it('formats XP with uk-UA grouping and a no-break space before the unit', () => {
    expect(formatXp(640)).toBe(`640${NBSP}XP`);
    expect(formatXp(1200)).toBe(`1${NBSP}200${NBSP}XP`);
    expect(xpGainText(130)).toBe(`+130${NBSP}XP`);
  });

  it('describes the way to the next level like the profile mockup', () => {
    expect(nextLevelText(levelProgress(640))).toBe(`Ще 560${NBSP}XP до рівня «Член наглядової ради»`);
    expect(nextLevelText(levelProgress(5000))).toBe('Ви досягли найвищого рівня — «Голова ради»');
    expect(levelPositionText(levelProgress(640))).toBe('Ваш рівень — 2 із 5');
  });

  it('counts badges with Ukrainian plural forms', () => {
    expect(badgesEarnedText(3, 9)).toBe('Здобуто 3 із 9');
    expect(newBadgesText(1)).toBe('Отримано 1 новий бейдж');
    expect(newBadgesText(3)).toBe('Отримано 3 нові бейджі');
    expect(newBadgesText(5)).toBe('Отримано 5 нових бейджів');
    expect(newBadgesText(21)).toBe('Отримано 21 новий бейдж');
  });

  it('summarises an event outcome for an aria-live toast', () => {
    const text = eventOutcomeText({
      xpGained: 130,
      duplicate: false,
      leveledUp: true,
      levelAfter: LEVELS[1]!,
      newBadges: ['kvorum-zibrano', 'prozorist'],
    });
    expect(text).toBe(`+130${NBSP}XP. Новий рівень: «Міноритарій». Отримано 2 нові бейджі: «Кворум зібрано», «Прозорість».`);
  });

  it('says that a repeat gives no new XP', () => {
    const text = eventOutcomeText({ xpGained: 0, duplicate: false, leveledUp: false, levelAfter: LEVELS[0]!, newBadges: [] });
    expect(text).toBe('Результат не перевищує попередній найкращий — нових XP немає.');
  });
});
