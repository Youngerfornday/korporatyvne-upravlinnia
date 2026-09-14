export type StorageOperation = 'getItem' | 'setItem' | 'removeItem';

export interface FakeStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
  readonly entries: () => ReadonlyMap<string, string>;
  failOn(operation: StorageOperation, error?: Error): void;
  failOnKey(operation: StorageOperation, key: string, error?: Error): void;
  recover(): void;
}

/** Імітація Web Storage з керованими збоями (QuotaExceededError, SecurityError). */
export function createFakeStorage(initial: Record<string, string> = {}): FakeStorage {
  const data = new Map<string, string>(Object.entries(initial));
  const failures = new Map<string, Error>();

  const assertAllowed = (operation: StorageOperation, key: string): void => {
    const error = failures.get(`${operation}:${key}`) ?? failures.get(`${operation}:*`);
    if (error) throw error;
  };

  return {
    getItem(key) {
      assertAllowed('getItem', key);
      return data.get(key) ?? null;
    },
    setItem(key, value) {
      assertAllowed('setItem', key);
      data.set(key, String(value));
    },
    removeItem(key) {
      assertAllowed('removeItem', key);
      data.delete(key);
    },
    entries: () => new Map(data),
    failOn(operation, error = new Error(`${operation} failed`)) {
      failures.set(`${operation}:*`, error);
    },
    failOnKey(operation, key, error = new Error(`${operation} failed for ${key}`)) {
      failures.set(`${operation}:${key}`, error);
    },
    recover() {
      failures.clear();
    },
  };
}

export function quotaExceededError(): Error {
  const error = new Error('The quota has been exceeded.');
  error.name = 'QuotaExceededError';
  return error;
}
