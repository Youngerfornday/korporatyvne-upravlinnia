import { MAX_SERIALIZED_PROGRESS_LENGTH } from './codec';
import { prepareForSave } from './prepare-save';
import { ProgressStateSchema, createEmptyProgress, type ProgressState } from './state';
import type { ProgressStore, ProgressStoreOptions } from './store';

export interface MemoryProgressStoreOptions extends ProgressStoreOptions {
  readonly initial?: ProgressState;
}

/** Сховище в пам’яті: для тестів і як запасний варіант. Назовні віддаються лише копії. */
export function createMemoryProgressStore(options: MemoryProgressStoreOptions = {}): ProgressStore {
  const now = options.now ?? (() => new Date());
  const maxLength = options.maxSerializedLength ?? MAX_SERIALIZED_PROGRESS_LENGTH;
  // Невалідний початковий стан — помилка програміста, тому parse, а не safeParse.
  let current: ProgressState | null = options.initial ? ProgressStateSchema.parse(options.initial) : null;

  return {
    load() {
      if (current === null) return { status: 'empty', state: createEmptyProgress(now()) };
      return { status: 'loaded', state: structuredClone(current) };
    },
    save(state) {
      const prepared = prepareForSave(state, now(), maxLength);
      if (!prepared.ok) return { status: 'rejected', reason: prepared.reason };
      current = prepared.state;
      return { status: 'saved', state: structuredClone(prepared.state) };
    },
    clear() {
      current = null;
      return { status: 'cleared' };
    },
    flush() {
      // Постійного сховища немає, передавати нікуди.
    },
    isPersistent: () => false,
  };
}
