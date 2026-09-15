import { describe, expect, it } from 'vitest';
import { FIXED_NOW, sampleProgress, sampleProgressV1 } from './__fixtures__/sample-state';
import { PROGRESS_MIGRATIONS, migrateProgress, type MigrationTable } from './migrations';
import { PROGRESS_LIMITS, PROGRESS_SCHEMA_VERSION } from './state';

/** Гіпотетичний формат v0, щоб перевірити механізм ланцюжка міграцій. */
const legacyV0 = {
  schemaVersion: 0,
  savedAt: '2026-09-01T12:00:00.000Z',
  points: 40,
  doneTopics: ['t01'],
};

const v0ToV1: MigrationTable = {
  0: (input) => ({
    schemaVersion: 1,
    updatedAt: input['savedAt'],
    xp: input['points'],
    badges: [],
    topics: Object.fromEntries(
      (input['doneTopics'] as string[]).map((id) => [id, { status: 'completed', updatedAt: input['savedAt'] }]),
    ),
    quizzes: {},
    flashcards: {},
    activities: {},
  }),
};

const fullChain: MigrationTable = { ...PROGRESS_MIGRATIONS, ...v0ToV1 };

describe('migrateProgress', () => {
  it('ships a migration for every version below the current one', () => {
    const versions = Object.keys(PROGRESS_MIGRATIONS).map(Number);
    expect(versions.every((version) => version < PROGRESS_SCHEMA_VERSION)).toBe(true);
    for (let version = 1; version < PROGRESS_SCHEMA_VERSION; version += 1) {
      expect(PROGRESS_MIGRATIONS[version]).toBeTypeOf('function');
    }
  });

  it('returns the state unchanged when it already has the current version', () => {
    // Arrange
    const state = sampleProgress();

    // Act
    const result = migrateProgress(state);

    // Assert
    expect(result).toEqual({ ok: true, migrated: false, state });
  });

  it('applies migrations step by step up to the current version', () => {
    // Act
    const result = migrateProgress(legacyV0, fullChain);

    // Assert
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.migrated).toBe(true);
    expect(result.state.schemaVersion).toBe(PROGRESS_SCHEMA_VERSION);
    expect(result.state.topics['t01']?.status).toBe('completed');
    expect(result.state.xp).toBe(100);
  });

  it('does not mutate the input object', () => {
    // Arrange
    const input = structuredClone(legacyV0);
    const v1 = sampleProgressV1();
    const v1Copy = structuredClone(v1);

    // Act
    migrateProgress(input, fullChain);
    migrateProgress(v1);

    // Assert
    expect(input).toEqual(legacyV0);
    expect(v1).toEqual(v1Copy);
  });

  it.each([
    ['null', null],
    ['an array', []],
    ['a string', 'progress'],
  ])('rejects %s as not-object', (_label, input) => {
    expect(migrateProgress(input)).toEqual({ ok: false, error: 'not-object' });
  });

  it('rejects data without an integer schema version', () => {
    expect(migrateProgress({ xp: 1 })).toEqual({ ok: false, error: 'missing-version' });
    expect(migrateProgress({ schemaVersion: '1' })).toEqual({ ok: false, error: 'missing-version' });
    expect(migrateProgress({ schemaVersion: -1 })).toEqual({ ok: false, error: 'missing-version' });
  });

  it('reports data from a newer version of the site', () => {
    expect(migrateProgress({ ...sampleProgress(), schemaVersion: PROGRESS_SCHEMA_VERSION + 1 })).toEqual({
      ok: false,
      error: 'future-version',
    });
  });

  it('reports an old version that has no migration', () => {
    expect(migrateProgress(legacyV0)).toEqual({ ok: false, error: 'missing-migration' });
  });

  it('reports invalid data when a migration throws', () => {
    const throwing: MigrationTable = {
      ...PROGRESS_MIGRATIONS,
      0: () => {
        throw new Error('broken');
      },
    };
    expect(migrateProgress(legacyV0, throwing)).toEqual({ ok: false, error: 'invalid-data' });
  });

  it('reports invalid data when a migration does not advance the version', () => {
    const stuck: MigrationTable = { ...PROGRESS_MIGRATIONS, 0: (input) => ({ ...input }) };
    expect(migrateProgress(legacyV0, stuck)).toEqual({ ok: false, error: 'invalid-data' });
  });

  it('reports invalid data when the result fails schema validation', () => {
    expect(migrateProgress({ ...sampleProgress(), xp: 'many' })).toEqual({ ok: false, error: 'invalid-data' });
  });
});

describe('migration 1 → 2', () => {
  it('turns the badge list into awards dated with the last update of the v1 state', () => {
    const result = migrateProgress(sampleProgressV1());
    expect(result.ok && result.state.badges).toEqual({ 'kvorum-zibrano': { awardedAt: FIXED_NOW.toISOString() } });
  });

  it('rebuilds the XP ledger from recorded progress so repeats cannot farm XP again', () => {
    // Act
    const result = migrateProgress(sampleProgressV1());

    // Assert
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.migrated).toBe(true);
    expect(result.state.xpLedger).toEqual({
      'topic-read:t01': 100,
      'quiz:t01-training': 120,
      'trainer:p3-quorum-calculator': 60,
    });
    expect(result.state.recentEventIds).toEqual([]);
    expect(result.state.activities).toEqual(sampleProgressV1()['activities']);
  });

  it('never lowers XP: keeps the larger of stored XP and the rebuilt ledger total', () => {
    const lowXp = migrateProgress({ ...sampleProgressV1(), xp: 5 });
    const highXp = migrateProgress({ ...sampleProgressV1(), xp: 900 });
    expect(lowXp.ok && lowXp.state.xp).toBe(280);
    expect(highXp.ok && highXp.state.xp).toBe(900);
  });

  it('skips zero awards and caps XP at the schema limit', () => {
    const v1 = {
      ...sampleProgressV1(),
      xp: PROGRESS_LIMITS.xp,
      quizzes: { q1: { attempts: 1, bestScore: 0, lastAttemptAt: FIXED_NOW.toISOString() } },
      activities: {},
      topics: {},
    };
    const result = migrateProgress(v1);
    expect(result.ok && result.state.xpLedger).toEqual({});
    expect(result.ok && result.state.xp).toBe(PROGRESS_LIMITS.xp);
  });

  it('rejects v1 data that does not match the v1 format', () => {
    expect(migrateProgress({ ...sampleProgressV1(), badges: 'all' })).toEqual({ ok: false, error: 'invalid-data' });
  });
});
