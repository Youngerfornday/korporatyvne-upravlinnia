import { describe, expect, it } from 'vitest';
import { sampleProgress } from './__fixtures__/sample-state';
import { PROGRESS_MIGRATIONS, migrateProgress, type MigrationTable } from './migrations';
import { PROGRESS_SCHEMA_VERSION } from './state';

/** Гіпотетичний формат v0, щоб перевірити механізм міграцій. */
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

describe('migrateProgress', () => {
  it('ships a migration table that is consistent with the current schema version', () => {
    // Assert
    const versions = Object.keys(PROGRESS_MIGRATIONS).map(Number);
    expect(versions.every((version) => version < PROGRESS_SCHEMA_VERSION)).toBe(true);
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
    const result = migrateProgress(legacyV0, v0ToV1);

    // Assert
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.migrated).toBe(true);
    expect(result.state.xp).toBe(40);
    expect(result.state.topics['t01']?.status).toBe('completed');
  });

  it('does not mutate the input object', () => {
    // Arrange
    const input = structuredClone(legacyV0);

    // Act
    migrateProgress(input, v0ToV1);

    // Assert
    expect(input).toEqual(legacyV0);
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
    expect(migrateProgress(legacyV0, {})).toEqual({ ok: false, error: 'missing-migration' });
  });

  it('reports invalid data when a migration throws', () => {
    // Arrange
    const throwing: MigrationTable = {
      0: () => {
        throw new Error('broken');
      },
    };

    // Act and Assert
    expect(migrateProgress(legacyV0, throwing)).toEqual({ ok: false, error: 'invalid-data' });
  });

  it('reports invalid data when a migration does not advance the version', () => {
    // Arrange
    const stuck: MigrationTable = { 0: (input) => ({ ...input }) };

    // Act and Assert
    expect(migrateProgress(legacyV0, stuck)).toEqual({ ok: false, error: 'invalid-data' });
  });

  it('reports invalid data when the result fails schema validation', () => {
    expect(migrateProgress({ ...sampleProgress(), xp: 'many' })).toEqual({ ok: false, error: 'invalid-data' });
  });
});
