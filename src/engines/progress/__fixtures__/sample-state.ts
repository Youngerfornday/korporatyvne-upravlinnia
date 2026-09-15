import type { ProgressState } from '../state';

export const FIXED_NOW = new Date('2026-09-14T10:00:00.000Z');
export const LATER_NOW = new Date('2026-09-15T08:30:00.000Z');

export function sampleProgress(): ProgressState {
  return {
    schemaVersion: 2,
    updatedAt: FIXED_NOW.toISOString(),
    xp: 340,
    xpLedger: {
      'topic-read:t01': 100,
      'quiz:t01-training': 120,
      'trainer:p3-quorum-calculator': 60,
      'self-check:t01': 20,
      'flashcards:t01': 40,
    },
    badges: { 'kvorum-zibrano': { awardedAt: FIXED_NOW.toISOString() } },
    recentEventIds: ['topic-read:t01', 'quiz:t01-training:1757844000000'],
    topics: {
      t01: { status: 'completed', updatedAt: FIXED_NOW.toISOString() },
      t02: { status: 'in-progress', updatedAt: FIXED_NOW.toISOString() },
    },
    quizzes: {
      't01-training': { attempts: 2, bestScore: 0.8, lastAttemptAt: FIXED_NOW.toISOString() },
    },
    flashcards: {
      'agency-problem': { box: 3, reviewedAt: FIXED_NOW.toISOString() },
    },
    activities: {
      'p3-quorum-calculator': {
        attempts: 1,
        bestScore: 1,
        completedAt: FIXED_NOW.toISOString(),
        solvedVariants: ['scenario-1'],
      },
    },
  };
}

/** Знімок формату версії 1 (до журналу XP і дат бейджів) — вхід для тестів міграції. */
export function sampleProgressV1(): Record<string, unknown> {
  return {
    schemaVersion: 1,
    updatedAt: FIXED_NOW.toISOString(),
    xp: 120,
    badges: ['kvorum-zibrano'],
    topics: {
      t01: { status: 'completed', updatedAt: FIXED_NOW.toISOString() },
      t02: { status: 'in-progress', updatedAt: FIXED_NOW.toISOString() },
    },
    quizzes: {
      't01-training': { attempts: 2, bestScore: 0.8, lastAttemptAt: FIXED_NOW.toISOString() },
    },
    flashcards: {
      'agency-problem': { box: 3, reviewedAt: FIXED_NOW.toISOString() },
    },
    activities: {
      'p3-quorum-calculator': { attempts: 1, bestScore: 1, completedAt: FIXED_NOW.toISOString() },
    },
  };
}
