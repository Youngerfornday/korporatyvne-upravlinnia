import { MAX_SERIALIZED_PROGRESS_LENGTH, deserializeProgress, type DecodeError } from './codec';
import { PROGRESS_MIGRATIONS, type MigrationTable } from './migrations';
import { prepareForSave } from './prepare-save';
import { createEmptyProgress, type ProgressState } from './state';
import type { ProgressLoadResult, ProgressStore, ProgressStoreOptions } from './store';

/** Origin youngerfornday.github.io спільний з іншими сайтами, тому всі ключі курсу мають префікс. */
export const PROGRESS_STORAGE_PREFIX = 'ku:v1:';
export const PROGRESS_STORAGE_KEY = `${PROGRESS_STORAGE_PREFIX}progress`;
export const PROGRESS_BACKUP_KEY = `${PROGRESS_STORAGE_PREFIX}progress-backup`;
const PROBE_KEY = `${PROGRESS_STORAGE_PREFIX}probe`;

/** Скільки символів завеликого запису зберігається в резервній копії (для діагностики). */
export const MAX_BACKUP_PREFIX_LENGTH = 1000;

export type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export interface LocalStorageProgressStoreOptions extends ProgressStoreOptions {
  /** Джерело сховища; звернення до `localStorage` може кинути SecurityError, тому це функція. */
  readonly getStorage?: () => StorageLike | null | undefined;
  readonly migrations?: MigrationTable;
}

const defaultGetStorage = (): StorageLike | undefined => globalThis.localStorage;

type Attempt<T> = { readonly ok: true; readonly value: T } | { readonly ok: false };

/** Єдина точка, де перехоплюються винятки Web Storage; результат завжди явно обробляє викликач. */
function attempt<T>(operation: () => T): Attempt<T> {
  try {
    return { ok: true, value: operation() };
  } catch {
    return { ok: false };
  }
}

export function createLocalStorageProgressStore(options: LocalStorageProgressStoreOptions = {}): ProgressStore {
  const getStorage = options.getStorage ?? defaultGetStorage;
  const now = options.now ?? (() => new Date());
  const maxLength = options.maxSerializedLength ?? MAX_SERIALIZED_PROGRESS_LENGTH;
  const migrations = options.migrations ?? PROGRESS_MIGRATIONS;

  let resolved: StorageLike | null | undefined;
  /** Найновіший стан, який не вдалося записати в сховище; має пріоритет над сховищем. */
  let unsaved: ProgressState | null = null;

  function storage(): StorageLike | null {
    if (resolved !== undefined) return resolved;
    const probe = attempt(() => {
      const candidate = getStorage();
      if (!candidate) return null;
      candidate.setItem(PROBE_KEY, '1');
      candidate.removeItem(PROBE_KEY);
      return candidate;
    });
    resolved = probe.ok ? probe.value : null;
    return resolved;
  }

  function recover(target: StorageLike, raw: string, issue: DecodeError): ProgressLoadResult {
    // Завеликий запис не копіюємо цілком: резервна копія сама могла б вичерпати квоту сховища.
    const backupValue =
      raw.length > maxLength
        ? JSON.stringify({ truncated: true, originalLength: raw.length, prefix: raw.slice(0, MAX_BACKUP_PREFIX_LENGTH) })
        : raw;
    const backup = attempt(() => target.setItem(PROGRESS_BACKUP_KEY, backupValue));
    return { status: 'recovered', issue, backupSaved: backup.ok, state: createEmptyProgress(now()) };
  }

  return {
    load() {
      if (unsaved !== null) return { status: 'memory-only', state: structuredClone(unsaved) };

      const target = storage();
      const read = target ? attempt(() => target.getItem(PROGRESS_STORAGE_KEY)) : null;
      if (!target || !read || !read.ok || read.value === null) {
        return { status: 'empty', state: createEmptyProgress(now()) };
      }

      const decoded = deserializeProgress(read.value, migrations, maxLength);
      if (!decoded.ok) return recover(target, read.value, decoded.error);
      return { status: decoded.migrated ? 'migrated' : 'loaded', state: decoded.state };
    },

    save(state) {
      const prepared = prepareForSave(state, now(), maxLength);
      if (!prepared.ok) return { status: 'rejected', reason: prepared.reason };

      const target = storage();
      if (!target) {
        unsaved = prepared.state;
        return { status: 'memory-only', reason: 'unavailable', state: structuredClone(prepared.state) };
      }

      const write = attempt(() => target.setItem(PROGRESS_STORAGE_KEY, prepared.serialized));
      if (!write.ok) {
        unsaved = prepared.state;
        return { status: 'memory-only', reason: 'write-failed', state: structuredClone(prepared.state) };
      }

      unsaved = null;
      return { status: 'saved', state: structuredClone(prepared.state) };
    },

    clear() {
      unsaved = null;
      const target = storage();
      if (!target) return { status: 'memory-only' };
      const removal = attempt(() => {
        target.removeItem(PROGRESS_STORAGE_KEY);
        target.removeItem(PROGRESS_BACKUP_KEY);
      });
      return removal.ok ? { status: 'cleared' } : { status: 'memory-only' };
    },

    flush() {
      // localStorage записує синхронно в save(); окремої фіксації не потрібно.
    },

    isPersistent: () => storage() !== null && unsaved === null,
  };
}
