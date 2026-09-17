import { describe, expect, it } from 'vitest';
import { BADGE_ACTIVITY_IDS, findBadge } from '../../engines/gamification';
import { createEmptyProgress } from '../../engines/progress';
import { CALCULATOR_TRAINERS, MATRIX_TRAINER, practicalLabel, practicalPath, publishedTrainer, topicTrainerActivityIds, trainerKindLabel } from './catalog';
import { practicumNote, practicumProgress } from './practicum-progress';

const PRACTICALS = [
  { id: 'p01', topics: ['t01', 't02'], trainers: ['model-matrix'] },
  { id: 'p03', topics: ['t04'], trainers: ['quorum', 'cumulative-voting'] },
  { id: 'p06', topics: ['t08'], trainers: ['auction', 'bonds'] },
];

describe('каталог тренажерів', () => {
  it('ID активностей калькуляторів збігаються з ID бейджів рушія', () => {
    expect(CALCULATOR_TRAINERS.map((trainer) => trainer.activityId)).toEqual([
      BADGE_ACTIVITY_IDS.quorumCalculator,
      BADGE_ACTIVITY_IDS.cumulativeVoting,
      BADGE_ACTIVITY_IDS.dividendDistribution,
    ]);
    expect(new Set(CALCULATOR_TRAINERS.map((trainer) => trainer.path)).size).toBe(3);
    expect(MATRIX_TRAINER.activityId).toBe('p01-model-matrix');
    expect(CALCULATOR_TRAINERS.every((trainer) => findBadge(trainer.badgeId) !== undefined)).toBe(true);
  });

  it('опубліковані тренажери знаходяться за ID реєстру, неопубліковані — ні', () => {
    expect(publishedTrainer('quorum')).toMatchObject({ path: 'trenazhery/kvorum/', activityId: 'quorum-calculator' });
    expect(publishedTrainer('model-matrix')).toMatchObject({ path: 'praktychni/p01/#trenazher', activityId: 'p01-model-matrix' });
    expect(publishedTrainer('auction')).toBeNull();
  });

  it('тема отримує активності опублікованих тренажерів своїх практичних', () => {
    expect(topicTrainerActivityIds(PRACTICALS, 't02')).toEqual(['p01-model-matrix']);
    expect(topicTrainerActivityIds(PRACTICALS, 't04')).toEqual(['quorum-calculator', 'cumulative-voting-calculator']);
    expect(topicTrainerActivityIds(PRACTICALS, 't08')).toEqual([]);
  });

  it('підписи й шляхи', () => {
    expect(trainerKindLabel('dupont')).toBe('модель DuPont');
    expect(trainerKindLabel('unknown-kind')).toBe('unknown-kind');
    expect(trainerKindLabel('toString')).toBe('toString');
    expect(practicalPath('p01')).toBe('praktychni/p01/');
    expect(practicalLabel('p08')).toBe('П8');
  });
});

describe('practicumProgress', () => {
  const now = new Date('2026-09-17T10:00:00.000Z');
  const activity = { attempts: 1, bestScore: 1, completedAt: now.toISOString() };

  it('немає тренажерів — null; жодного, частина, усі', () => {
    const empty = createEmptyProgress(now);
    expect(practicumProgress(empty, [])).toBeNull();
    expect(practicumProgress(empty, ['quorum-calculator'])).toEqual({ state: 'todo', done: 0, total: 1 });

    const one = { ...empty, activities: { 'quorum-calculator': activity } };
    const partial = practicumProgress(one, ['quorum-calculator', 'cumulative-voting-calculator']);
    expect(partial).toEqual({ state: 'doing', done: 1, total: 2 });
    expect(partial && practicumNote(partial)).toBe('1 із 2');

    const full = practicumProgress(one, ['quorum-calculator']);
    expect(full).toEqual({ state: 'done', done: 1, total: 1 });
    expect(full && practicumNote(full)).toBeUndefined();
  });
});
