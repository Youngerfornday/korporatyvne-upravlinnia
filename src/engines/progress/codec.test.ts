import { describe, expect, it } from 'vitest';
import { sampleProgress } from './__fixtures__/sample-state';
import { MAX_SERIALIZED_PROGRESS_LENGTH, deserializeProgress, serializeProgress } from './codec';

describe('serializeProgress / deserializeProgress', () => {
  it('round-trips a valid state', () => {
    // Arrange
    const state = sampleProgress();

    // Act
    const result = deserializeProgress(serializeProgress(state));

    // Assert
    expect(result).toEqual({ ok: true, migrated: false, state });
  });

  it('rejects input longer than the size limit before parsing it', () => {
    // Arrange
    const huge = `{"pad":"${'x'.repeat(MAX_SERIALIZED_PROGRESS_LENGTH)}"}`;

    // Act and Assert
    expect(deserializeProgress(huge)).toEqual({ ok: false, error: 'too-large' });
  });

  it('rejects malformed JSON', () => {
    expect(deserializeProgress('{"schemaVersion":')).toEqual({ ok: false, error: 'invalid-json' });
  });

  it('passes migration errors through', () => {
    expect(deserializeProgress('{"schemaVersion":999}')).toEqual({ ok: false, error: 'future-version' });
  });

  it('throws when asked to serialize an invalid state', () => {
    // Arrange
    const invalid = { ...sampleProgress(), xp: -5 };

    // Act and Assert
    expect(() => serializeProgress(invalid)).toThrow(/некоректний стан прогресу/i);
  });
});
