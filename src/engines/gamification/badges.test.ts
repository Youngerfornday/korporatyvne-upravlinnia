import { describe, expect, it } from 'vitest';
import { FIXED_NOW } from '../progress/__fixtures__/sample-state';
import { createEmptyProgress, type ProgressState } from '../progress/state';
import { BADGES, BADGE_ACTIVITY_IDS, earnedBadgeIds } from './badges';

const at = FIXED_NOW.toISOString();

function withActivity(id: string, bestScore: number, solvedVariants?: string[]): ProgressState {
  const base = createEmptyProgress(FIXED_NOW);
  const activity = solvedVariants ? { attempts: 1, bestScore, solvedVariants } : { attempts: 1, bestScore };
  return { ...base, activities: { [id]: activity } };
}

describe('BADGES', () => {
  it('defines nine badges with unique IDs and both texts in Ukrainian', () => {
    expect(BADGES).toHaveLength(9);
    expect(new Set(BADGES.map((badge) => badge.id)).size).toBe(9);
    for (const badge of BADGES) {
      expect(badge.id).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
      expect(badge.condition).toMatch(/[а-яіїєґ]/i);
      expect(badge.achievement).toMatch(/[а-яіїєґ]/i);
    }
  });

  it('keeps the badges named in DESIGN.md and PRODUCT.md', () => {
    const titles = BADGES.map((badge) => badge.title);
    for (const title of ['Кворум зібрано', 'Кумулятивний голос', 'Уважний читач', 'Прозорість', 'Три лінії', 'Дивідендна дисципліна']) {
      expect(titles).toContain(title);
    }
  });

  it('earns nothing on an empty state', () => {
    expect(earnedBadgeIds(createEmptyProgress(FIXED_NOW))).toEqual([]);
  });
});

describe('badge predicates', () => {
  it('«Кворум зібрано» needs three different solved quorum scenarios', () => {
    expect(earnedBadgeIds(withActivity(BADGE_ACTIVITY_IDS.quorumCalculator, 1, ['a', 'b']))).toEqual([]);
    expect(earnedBadgeIds(withActivity(BADGE_ACTIVITY_IDS.quorumCalculator, 1, ['a', 'b', 'c']))).toEqual(['kvorum-zibrano']);
  });

  it.each([
    [BADGE_ACTIVITY_IDS.cumulativeVoting, 'kumuliatyvnyi-holos'],
    [BADGE_ACTIVITY_IDS.disclosureChecklist, 'prozorist'],
    [BADGE_ACTIVITY_IDS.threeLines, 'try-linii'],
    [BADGE_ACTIVITY_IDS.dividendDistribution, 'dyvidendna-dystsyplina'],
    [BADGE_ACTIVITY_IDS.orderAuction, 'tsina-vidsikannia'],
    [BADGE_ACTIVITY_IDS.generalMeeting, 'protokol-pidpysano'],
    [BADGE_ACTIVITY_IDS.boardDecision, 'sumlinnyi-dyrektor'],
  ])('a flawless result in %s earns %s, a partial one does not', (activityId, badgeId) => {
    expect(earnedBadgeIds(withActivity(activityId, 1))).toEqual([badgeId]);
    expect(earnedBadgeIds(withActivity(activityId, 0.99))).toEqual([]);
  });

  it('«Уважний читач» needs five completed topics', () => {
    const base = createEmptyProgress(FIXED_NOW);
    const topics = (count: number) =>
      Object.fromEntries(Array.from({ length: count }, (_, index) => [`t0${index + 1}`, { status: 'completed' as const, updatedAt: at }]));
    const inProgress = { t09: { status: 'in-progress' as const, updatedAt: at } };
    expect(earnedBadgeIds({ ...base, topics: { ...topics(4), ...inProgress } })).toEqual([]);
    expect(earnedBadgeIds({ ...base, topics: topics(5) })).toEqual(['uvazhnyi-chytach']);
  });
});
