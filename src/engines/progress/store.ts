import type { DecodeError } from './codec';
import type { ProgressState } from './state';

export type ProgressLoadResult =
  | { readonly status: 'empty'; readonly state: ProgressState }
  | { readonly status: 'loaded' | 'migrated'; readonly state: ProgressState }
  /** Дані лише в пам'яті поточної сесії: сховище недоступне або останній запис не вдався. */
  | { readonly status: 'memory-only'; readonly state: ProgressState }
  /** Збережені дані не прочитано; сирий рядок скопійовано в резервну копію (якщо вдалося). */
  | {
      readonly status: 'recovered';
      readonly state: ProgressState;
      readonly issue: DecodeError;
      readonly backupSaved: boolean;
    };

export type ProgressSaveResult =
  | { readonly status: 'saved'; readonly state: ProgressState }
  | { readonly status: 'memory-only'; readonly state: ProgressState; readonly reason: 'unavailable' | 'write-failed' }
  | { readonly status: 'rejected'; readonly reason: 'invalid-state' | 'too-large' };

export type ProgressClearResult = { readonly status: 'cleared' } | { readonly status: 'memory-only' };

/**
 * Сховище прогресу студента. Реалізації: localStorage (сайт), пам'ять (тести), SCORM 1.2 (пакети для Moodle).
 *
 * Контракт, спільний для всіх реалізацій:
 * - методи ніколи не кидають винятків через збої сховища — результат описує, що сталося;
 * - стан завжди цілий знімок (SCORM зберігає його в один рядок `cmi.suspend_data`);
 * - аргументи й повернені об'єкти не діляться посиланнями з внутрішнім станом.
 */
export interface ProgressStore {
  /** Повертає валідний стан; за відсутності або пошкодження даних — порожній. */
  load(): ProgressLoadResult;
  /** Валідує стан, ставить `updatedAt` і записує копію. Аргумент не змінюється. */
  save(state: ProgressState): ProgressSaveResult;
  /** Видаляє лише дані курсу. */
  clear(): ProgressClearResult;
  /** Остаточно передає дані в постійне сховище (для SCORM — LMSCommit на `pagehide`). */
  flush(): void;
  /** Чи переживе прогрес перезавантаження сторінки. */
  isPersistent(): boolean;
}

export interface ProgressStoreOptions {
  readonly now?: () => Date;
  readonly maxSerializedLength?: number;
}
