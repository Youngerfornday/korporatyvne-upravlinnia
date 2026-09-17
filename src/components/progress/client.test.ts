import { afterEach, describe, expect, it } from 'vitest';
import { createMemoryProgressStore } from '../../engines/progress';
import { getProgressClient, installProgressStore } from './client';

const GLOBAL_KEY = '__kuProgressClient';

afterEach(() => {
  delete (globalThis as Record<string, unknown>)[GLOBAL_KEY];
});

describe('installProgressStore', () => {
  it('makes every later getProgressClient() use the installed store', () => {
    // Arrange
    const store = createMemoryProgressStore();

    // Act
    const installed = installProgressStore(store);

    // Assert
    expect(getProgressClient()).toBe(installed);
    expect(installed.isPersistent()).toBe(false);
  });

  it('refuses to replace a client that islands may already share', () => {
    // Arrange
    installProgressStore(createMemoryProgressStore());

    // Act and Assert
    expect(() => installProgressStore(createMemoryProgressStore())).toThrow(/до першого getProgressClient/);
  });
});
