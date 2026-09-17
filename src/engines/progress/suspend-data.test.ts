import { describe, expect, it } from 'vitest';
import { FIXED_NOW, sampleProgress } from './__fixtures__/sample-state';
import { MAX_SERIALIZED_PROGRESS_LENGTH } from './codec';
import { COMPRESSED_PREFIX, SCORM_SUSPEND_DATA_LIMIT, decodeSuspendData, encodeSuspendData, fitSuspendData } from './suspend-data';
import { createEmptyProgress, type ProgressState } from './state';

/** Стан з великою історією подій, що в сирому JSON не вміщається в 4096 символів. */
function stateWithHistory(events: number, prefix = 'trainer:quorum-calculator:variant'): ProgressState {
  return {
    ...sampleProgress(),
    recentEventIds: Array.from({ length: events }, (_, index) => `${prefix}-${index.toString(36)}-${(index * 7919).toString(36)}`),
  };
}

/** Непередбачувані ID (погано стискаються), щоб перевірити обрізання історії. */
function incompressibleHistory(events: number): ProgressState {
  let seed = 12345;
  const next = () => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed.toString(36);
  };
  return { ...sampleProgress(), recentEventIds: Array.from({ length: events }, () => `e${next()}${next()}${next()}${next()}${next()}`.slice(0, 110)) };
}

describe('SCORM_SUSPEND_DATA_LIMIT', () => {
  it('is the SCORM 1.2 CMIString4096 limit', () => {
    expect(SCORM_SUSPEND_DATA_LIMIT).toBe(4096);
  });
});

describe('encodeSuspendData and decodeSuspendData', () => {
  it('keeps short JSON as is, so the LMS data stays readable', () => {
    // Arrange
    const json = JSON.stringify(sampleProgress());

    // Act
    const encoded = encodeSuspendData(json, SCORM_SUSPEND_DATA_LIMIT);

    // Assert
    expect(encoded).toBe(json);
    expect(decodeSuspendData(encoded ?? '')).toEqual({ ok: true, json });
  });

  it('compresses JSON that does not fit and restores it exactly', () => {
    // Arrange
    const json = JSON.stringify(stateWithHistory(100));
    expect(json.length).toBeGreaterThan(SCORM_SUSPEND_DATA_LIMIT);

    // Act
    const encoded = encodeSuspendData(json, SCORM_SUSPEND_DATA_LIMIT);

    // Assert
    expect(encoded).not.toBeNull();
    expect(encoded?.startsWith(COMPRESSED_PREFIX)).toBe(true);
    expect(encoded?.length).toBeLessThanOrEqual(SCORM_SUSPEND_DATA_LIMIT);
    expect(encoded).toMatch(/^[\x21-\x7e]+$/);
    expect(decodeSuspendData(encoded ?? '')).toEqual({ ok: true, json });
  });

  it('round-trips non-ASCII text through compression', () => {
    // Arrange
    const json = JSON.stringify({ note: 'Кворум зібрано — «так» '.repeat(400) });

    // Act
    const encoded = encodeSuspendData(json, SCORM_SUSPEND_DATA_LIMIT) ?? '';

    // Assert
    expect(decodeSuspendData(encoded ?? '')).toEqual({ ok: true, json });
  });

  it('returns null when even the compressed form is too long', () => {
    expect(encodeSuspendData(JSON.stringify(incompressibleHistory(100)), 200)).toBeNull();
  });

  it('rejects broken compressed data without throwing', () => {
    expect(decodeSuspendData(`${COMPRESSED_PREFIX}@@@not-base64`)).toEqual({ ok: false, error: 'invalid-json' });
    expect(decodeSuspendData(`${COMPRESSED_PREFIX}AAAA`)).toEqual({ ok: false, error: 'invalid-json' });
  });

  it('rejects a compressed bomb that inflates past the progress size limit', () => {
    // Arrange: 200 000 однакових символів стискаються до кількохсот байтів.
    const bomb = encodeSuspendData(`"${'a'.repeat(MAX_SERIALIZED_PROGRESS_LENGTH * 4)}"`, SCORM_SUSPEND_DATA_LIMIT);

    // Act and Assert
    expect(bomb).not.toBeNull();
    expect(decodeSuspendData(bomb ?? '')).toEqual({ ok: false, error: 'too-large' });
  });

  it('rejects raw data longer than the SCORM limit before parsing', () => {
    expect(decodeSuspendData('x'.repeat(SCORM_SUSPEND_DATA_LIMIT + 1))).toEqual({ ok: false, error: 'too-large' });
  });
});

describe('fitSuspendData', () => {
  it('fits a small state without dropping anything', () => {
    // Arrange
    const state = sampleProgress();

    // Act
    const fitted = fitSuspendData(state, SCORM_SUSPEND_DATA_LIMIT);

    // Assert
    expect(fitted).toEqual({ ok: true, state, data: JSON.stringify(state), droppedEvents: 0 });
  });

  it('fits a long but repetitive history by compression alone', () => {
    // Arrange
    const state = stateWithHistory(100);

    // Act
    const fitted = fitSuspendData(state, SCORM_SUSPEND_DATA_LIMIT);

    // Assert
    expect(fitted.ok && fitted.droppedEvents).toBe(0);
    expect(fitted.ok && fitted.data.startsWith(COMPRESSED_PREFIX)).toBe(true);
  });

  it('drops the oldest processed event IDs when compression is not enough', () => {
    // Arrange
    const state = incompressibleHistory(100);
    const limit = 2500;

    // Act
    const fitted = fitSuspendData(state, limit);

    // Assert
    expect(fitted.ok).toBe(true);
    if (!fitted.ok) return;
    expect(fitted.droppedEvents).toBeGreaterThan(0);
    expect(fitted.data.length).toBeLessThanOrEqual(limit);
    expect(fitted.state.recentEventIds).toEqual(state.recentEventIds.slice(fitted.droppedEvents));
    expect(fitted.state.activities).toEqual(state.activities);
    expect(fitted.state.xp).toBe(state.xp);
    expect(state.recentEventIds).toHaveLength(100);
  });

  it('reports too-large when the state does not fit even without history', () => {
    expect(fitSuspendData(createEmptyProgress(FIXED_NOW), 50)).toEqual({ ok: false });
  });
});
