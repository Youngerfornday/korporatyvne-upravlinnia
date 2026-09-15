import { describe, expect, it } from 'vitest';
import { FIXED_NOW, sampleProgress } from './__fixtures__/sample-state';
import {
  PROGRESS_LIMITS,
  PROGRESS_SCHEMA_VERSION,
  ProgressStateSchema,
  createEmptyProgress,
  xpLedgerKey,
} from './state';

describe('ProgressStateSchema', () => {
  it('accepts a complete valid state', () => {
    // Arrange
    const state = sampleProgress();

    // Act
    const result = ProgressStateSchema.safeParse(state);

    // Assert
    expect(result.success).toBe(true);
  });

  it('creates an empty state stamped with the given time', () => {
    // Act
    const state = createEmptyProgress(FIXED_NOW);

    // Assert
    expect(state).toEqual({
      schemaVersion: PROGRESS_SCHEMA_VERSION,
      updatedAt: FIXED_NOW.toISOString(),
      xp: 0,
      xpLedger: {},
      badges: {},
      recentEventIds: [],
      topics: {},
      quizzes: {},
      flashcards: {},
      activities: {},
    });
    expect(PROGRESS_SCHEMA_VERSION).toBe(2);
    expect(ProgressStateSchema.safeParse(state).success).toBe(true);
  });

  it('rejects record keys that are not safe identifiers', () => {
    // Arrange
    const base = sampleProgress();
    const state = { ...base, topics: { 'T01 <b>': { status: 'completed', updatedAt: base.updatedAt } } };

    // Act
    const result = ProgressStateSchema.safeParse(state);

    // Assert
    expect(result.success).toBe(false);
  });

  it('never lets a __proto__ key from untrusted JSON reach the parsed state', () => {
    // Arrange
    const state = JSON.parse(
      '{"schemaVersion":2,"updatedAt":"2026-09-14T10:00:00.000Z","xp":0,"xpLedger":{},"badges":{},"recentEventIds":[],' +
        '"topics":{"__proto__":{"status":"completed","updatedAt":"2026-09-14T10:00:00.000Z"}},' +
        '"quizzes":{},"flashcards":{},"activities":{}}',
    ) as unknown;

    // Act
    const result = ProgressStateSchema.parse(state);

    // Assert
    expect(Object.keys(result.topics)).toEqual([]);
    expect(Object.getPrototypeOf(result.topics)).toBe(Object.prototype);
  });

  it('rejects scores outside the 0..1 range and negative xp', () => {
    // Arrange
    const base = sampleProgress();
    const badScore = { ...base, quizzes: { q1: { attempts: 1, bestScore: 1.5, lastAttemptAt: base.updatedAt } } };
    const negativeXp = { ...base, xp: -1 };

    // Act and Assert
    expect(ProgressStateSchema.safeParse(badScore).success).toBe(false);
    expect(ProgressStateSchema.safeParse(negativeXp).success).toBe(false);
  });

  it('rejects badge awards without a valid date', () => {
    const state = { ...sampleProgress(), badges: { prozorist: { awardedAt: 'yesterday' } } };
    expect(ProgressStateSchema.safeParse(state).success).toBe(false);
  });

  it('rejects records with more entries than the limit', () => {
    // Arrange
    const base = sampleProgress();
    const flashcards = Object.fromEntries(
      Array.from({ length: PROGRESS_LIMITS.flashcards + 1 }, (_, index) => [
        `term-${index}`,
        { box: 1, reviewedAt: base.updatedAt },
      ]),
    );

    // Act
    const result = ProgressStateSchema.safeParse({ ...base, flashcards });

    // Assert
    expect(result.success).toBe(false);
  });

  it('strips unknown fields instead of keeping them', () => {
    // Arrange
    const state = { ...sampleProgress(), injected: '<script>' };

    // Act
    const result = ProgressStateSchema.parse(state);

    // Assert
    expect(result).not.toHaveProperty('injected');
  });
});

describe('ProgressStateSchema: XP ledger, events and variants', () => {
  it.each([['Quiz:t01'], ['quiz'], ['quiz:'], ['quiz:__proto__'], [':t01'], ['quiz:t01 x']])('rejects ledger key «%s»', (key) => {
    const state = { ...sampleProgress(), xpLedger: { [key]: 10 } };
    expect(ProgressStateSchema.safeParse(state).success).toBe(false);
  });

  it('rejects fractional, negative or oversized ledger amounts', () => {
    for (const amount of [1.5, -1, PROGRESS_LIMITS.xpPerAward + 1]) {
      const state = { ...sampleProgress(), xpLedger: { 'quiz:t01': amount } };
      expect(ProgressStateSchema.safeParse(state).success).toBe(false);
    }
  });

  it('bounds the list of recent event IDs and checks their format', () => {
    const tooMany = Array.from({ length: PROGRESS_LIMITS.recentEvents + 1 }, (_, index) => `event-${index}`);
    expect(ProgressStateSchema.safeParse({ ...sampleProgress(), recentEventIds: tooMany }).success).toBe(false);
    expect(ProgressStateSchema.safeParse({ ...sampleProgress(), recentEventIds: ['<img>'] }).success).toBe(false);
  });

  it('requires solved variants of an activity to be unique', () => {
    const base = sampleProgress();
    const activities = {
      calc: { attempts: 1, bestScore: 1, solvedVariants: ['a', 'a'] },
    };
    expect(ProgressStateSchema.safeParse({ ...base, activities }).success).toBe(false);
  });
});

describe('xpLedgerKey', () => {
  it('joins the award kind and entity ID', () => {
    expect(xpLedgerKey('quiz', 't04-training')).toBe('quiz:t04-training');
  });
});
