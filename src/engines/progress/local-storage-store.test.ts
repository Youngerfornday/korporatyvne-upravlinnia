import { describe, expect, it } from 'vitest';
import { createFakeStorage, quotaExceededError } from './__fixtures__/fake-storage';
import { FIXED_NOW, LATER_NOW, sampleProgress } from './__fixtures__/sample-state';
import {
  PROGRESS_BACKUP_KEY,
  PROGRESS_STORAGE_KEY,
  PROGRESS_STORAGE_PREFIX,
  createLocalStorageProgressStore,
} from './local-storage-store';
import { serializeProgress } from './codec';
import { createEmptyProgress } from './state';

const now = () => FIXED_NOW;

describe('localStorage progress keys', () => {
  it('uses the ku:v1: prefix for every key', () => {
    expect(PROGRESS_STORAGE_PREFIX).toBe('ku:v1:');
    expect(PROGRESS_STORAGE_KEY.startsWith(PROGRESS_STORAGE_PREFIX)).toBe(true);
    expect(PROGRESS_BACKUP_KEY.startsWith(PROGRESS_STORAGE_PREFIX)).toBe(true);
  });
});

describe('createLocalStorageProgressStore: normal operation', () => {
  it('returns an empty state when nothing is stored', () => {
    // Arrange
    const store = createLocalStorageProgressStore({ getStorage: () => createFakeStorage(), now });

    // Act and Assert
    expect(store.load()).toEqual({ status: 'empty', state: createEmptyProgress(FIXED_NOW) });
    expect(store.isPersistent()).toBe(true);
  });

  it('saves under the prefixed key and loads the same state back', () => {
    // Arrange
    const storage = createFakeStorage();
    const store = createLocalStorageProgressStore({ getStorage: () => storage, now: () => LATER_NOW });

    // Act
    const saved = store.save(sampleProgress());
    const loaded = store.load();

    // Assert
    expect(saved.status).toBe('saved');
    expect(storage.entries().has(PROGRESS_STORAGE_KEY)).toBe(true);
    expect(loaded.status).toBe('loaded');
    expect(loaded.state).toEqual({ ...sampleProgress(), updatedAt: LATER_NOW.toISOString() });
  });

  it('reads the storage lazily, so creating the store never touches it', () => {
    // Arrange
    let calls = 0;
    const getStorage = () => {
      calls += 1;
      return createFakeStorage();
    };

    // Act
    createLocalStorageProgressStore({ getStorage, now });

    // Assert
    expect(calls).toBe(0);
  });

  it('reports migrated data', () => {
    // Arrange
    const storage = createFakeStorage({ [PROGRESS_STORAGE_KEY]: '{"schemaVersion":0,"points":7}' });
    const store = createLocalStorageProgressStore({
      getStorage: () => storage,
      now,
      migrations: { 0: (input) => ({ ...createEmptyProgress(FIXED_NOW), xp: input['points'] }) },
    });

    // Act
    const result = store.load();

    // Assert
    expect(result.status).toBe('migrated');
    expect(result.state.xp).toBe(7);
  });

  it('clears only its own keys and leaves other sites on the origin alone', () => {
    // Arrange
    const storage = createFakeStorage({
      [PROGRESS_STORAGE_KEY]: serializeProgress(sampleProgress()),
      [PROGRESS_BACKUP_KEY]: 'old',
      'tykho:settings': '{"theme":"dark"}',
    });
    const store = createLocalStorageProgressStore({ getStorage: () => storage, now });

    // Act
    const result = store.clear();

    // Assert
    expect(result).toEqual({ status: 'cleared' });
    expect([...storage.entries().keys()]).toEqual(['tykho:settings']);
  });

  it('flush is a no-op because writes are immediate', () => {
    // Arrange
    const storage = createFakeStorage();
    const store = createLocalStorageProgressStore({ getStorage: () => storage, now });

    // Act
    store.flush();

    // Assert
    expect(storage.entries().size).toBe(0);
  });
});

describe('createLocalStorageProgressStore: damaged or foreign data', () => {
  it('backs up corrupt data before returning an empty state', () => {
    // Arrange
    const storage = createFakeStorage({ [PROGRESS_STORAGE_KEY]: '{broken' });
    const store = createLocalStorageProgressStore({ getStorage: () => storage, now });

    // Act
    const result = store.load();

    // Assert
    expect(result).toEqual({
      status: 'recovered',
      issue: 'invalid-json',
      backupSaved: true,
      state: createEmptyProgress(FIXED_NOW),
    });
    expect(storage.entries().get(PROGRESS_BACKUP_KEY)).toBe('{broken');
  });

  it('backs up data written by a newer version instead of silently discarding it', () => {
    // Arrange
    const future = '{"schemaVersion":9,"xp":5000}';
    const storage = createFakeStorage({ [PROGRESS_STORAGE_KEY]: future });
    const store = createLocalStorageProgressStore({ getStorage: () => storage, now });

    // Act
    const result = store.load();

    // Assert
    expect(result.status).toBe('recovered');
    expect(storage.entries().get(PROGRESS_BACKUP_KEY)).toBe(future);
  });

  it('reports when the backup itself cannot be written', () => {
    // Arrange
    const storage = createFakeStorage({ [PROGRESS_STORAGE_KEY]: '{broken' });
    storage.failOnKey('setItem', PROGRESS_BACKUP_KEY, quotaExceededError());
    const store = createLocalStorageProgressStore({ getStorage: () => storage, now });

    // Act
    const result = store.load();

    // Assert
    expect(result).toMatchObject({ status: 'recovered', backupSaved: false });
  });
});

describe('createLocalStorageProgressStore: storage unavailable', () => {
  it('works in memory when localStorage is missing', () => {
    // Arrange
    const store = createLocalStorageProgressStore({ getStorage: () => undefined, now });

    // Act
    const saved = store.save(sampleProgress());
    const loaded = store.load();

    // Assert
    expect(saved).toMatchObject({ status: 'memory-only', reason: 'unavailable' });
    expect(loaded.status).toBe('memory-only');
    expect(loaded.state.xp).toBe(120);
    expect(store.isPersistent()).toBe(false);
    expect(store.clear()).toEqual({ status: 'memory-only' });
    expect(store.load().status).toBe('empty');
  });

  it('works in memory when accessing localStorage throws a SecurityError', () => {
    // Arrange
    const store = createLocalStorageProgressStore({
      getStorage: () => {
        throw new DOMException('denied', 'SecurityError');
      },
      now,
    });

    // Act and Assert
    expect(store.load()).toEqual({ status: 'empty', state: createEmptyProgress(FIXED_NOW) });
    expect(store.save(sampleProgress()).status).toBe('memory-only');
  });

  it('works in memory when the storage probe write fails (private mode)', () => {
    // Arrange
    const storage = createFakeStorage();
    storage.failOn('setItem', quotaExceededError());
    const store = createLocalStorageProgressStore({ getStorage: () => storage, now });

    // Act and Assert
    expect(store.isPersistent()).toBe(false);
    expect(store.save(sampleProgress())).toMatchObject({ status: 'memory-only', reason: 'unavailable' });
  });

  it('keeps the newest state in memory when a write fails, and persists again after recovery', () => {
    // Arrange
    const storage = createFakeStorage();
    const store = createLocalStorageProgressStore({ getStorage: () => storage, now });
    store.load();
    storage.failOnKey('setItem', PROGRESS_STORAGE_KEY, quotaExceededError());

    // Act
    const failed = store.save(sampleProgress());
    const whileFailing = store.load();
    storage.recover();
    const recovered = store.save(whileFailing.state);

    // Assert
    expect(failed).toMatchObject({ status: 'memory-only', reason: 'write-failed' });
    expect(whileFailing).toMatchObject({ status: 'memory-only' });
    expect(whileFailing.state.xp).toBe(120);
    expect(store.isPersistent()).toBe(true);
    expect(recovered.status).toBe('saved');
    expect(store.load().status).toBe('loaded');
  });

  it('falls back to memory when reading throws', () => {
    // Arrange
    const storage = createFakeStorage();
    storage.failOn('getItem');
    const store = createLocalStorageProgressStore({ getStorage: () => storage, now });

    // Act and Assert
    expect(store.load()).toEqual({ status: 'empty', state: createEmptyProgress(FIXED_NOW) });
  });

  it('reports memory-only when removing keys throws', () => {
    // Arrange
    const storage = createFakeStorage();
    const store = createLocalStorageProgressStore({ getStorage: () => storage, now });
    store.load();
    storage.failOn('removeItem');

    // Act and Assert
    expect(store.clear()).toEqual({ status: 'memory-only' });
  });

  it('rejects invalid and oversized states without writing', () => {
    // Arrange
    const storage = createFakeStorage();
    const store = createLocalStorageProgressStore({ getStorage: () => storage, now, maxSerializedLength: 50 });

    // Act and Assert
    expect(store.save({ ...sampleProgress(), xp: -1 })).toEqual({ status: 'rejected', reason: 'invalid-state' });
    expect(store.save(sampleProgress())).toEqual({ status: 'rejected', reason: 'too-large' });
    expect(storage.entries().size).toBe(0);
  });
});
