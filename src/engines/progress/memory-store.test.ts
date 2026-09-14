import { describe, expect, it } from 'vitest';
import { FIXED_NOW, LATER_NOW, sampleProgress } from './__fixtures__/sample-state';
import { createMemoryProgressStore } from './memory-store';
import { createEmptyProgress } from './state';

describe('createMemoryProgressStore', () => {
  it('starts empty when no initial state is given', () => {
    // Arrange
    const store = createMemoryProgressStore({ now: () => FIXED_NOW });

    // Act
    const result = store.load();

    // Assert
    expect(result).toEqual({ status: 'empty', state: createEmptyProgress(FIXED_NOW) });
    expect(store.isPersistent()).toBe(false);
  });

  it('loads the initial state', () => {
    // Arrange
    const store = createMemoryProgressStore({ initial: sampleProgress() });

    // Act and Assert
    expect(store.load()).toEqual({ status: 'loaded', state: sampleProgress() });
  });

  it('saves a copy stamped with the current time and never mutates the argument', () => {
    // Arrange
    const store = createMemoryProgressStore({ now: () => LATER_NOW });
    const state = sampleProgress();

    // Act
    const saved = store.save(state);

    // Assert
    expect(saved.status).toBe('saved');
    expect(state.updatedAt).toBe(FIXED_NOW.toISOString());
    expect(store.load().state.updatedAt).toBe(LATER_NOW.toISOString());
  });

  it('isolates stored data from later mutation of loaded objects', () => {
    // Arrange
    const store = createMemoryProgressStore({ initial: sampleProgress() });
    const loaded = store.load().state;

    // Act
    loaded.badges.push('mutated');

    // Assert
    expect(store.load().state.badges).toEqual(['kvorum-zibrano']);
  });

  it('rejects an invalid state and keeps the previous one', () => {
    // Arrange
    const store = createMemoryProgressStore({ initial: sampleProgress() });

    // Act
    const result = store.save({ ...sampleProgress(), xp: -1 });

    // Assert
    expect(result).toEqual({ status: 'rejected', reason: 'invalid-state' });
    expect(store.load().state.xp).toBe(120);
  });

  it('rejects a state that exceeds the configured size limit', () => {
    // Arrange
    const store = createMemoryProgressStore({ maxSerializedLength: 100 });

    // Act and Assert
    expect(store.save(sampleProgress())).toEqual({ status: 'rejected', reason: 'too-large' });
  });

  it('clears the data and accepts flush as a no-op', () => {
    // Arrange
    const store = createMemoryProgressStore({ initial: sampleProgress(), now: () => FIXED_NOW });

    // Act
    store.flush();
    const cleared = store.clear();

    // Assert
    expect(cleared).toEqual({ status: 'cleared' });
    expect(store.load().status).toBe('empty');
  });

  it('throws on an invalid initial state because that is a programming error', () => {
    expect(() => createMemoryProgressStore({ initial: { ...sampleProgress(), xp: -1 } })).toThrow();
  });
});
