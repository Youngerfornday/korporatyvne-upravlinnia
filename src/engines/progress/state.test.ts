import { describe, expect, it } from 'vitest';
import { FIXED_NOW, sampleProgress } from './__fixtures__/sample-state';
import {
  PROGRESS_LIMITS,
  PROGRESS_SCHEMA_VERSION,
  ProgressStateSchema,
  createEmptyProgress,
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
      badges: [],
      topics: {},
      quizzes: {},
      flashcards: {},
      activities: {},
    });
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
      '{"schemaVersion":1,"updatedAt":"2026-09-14T10:00:00.000Z","xp":0,"badges":[],' +
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

  it('rejects duplicate badges', () => {
    // Arrange
    const state = { ...sampleProgress(), badges: ['prozorist', 'prozorist'] };

    // Act
    const result = ProgressStateSchema.safeParse(state);

    // Assert
    expect(result.success).toBe(false);
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
