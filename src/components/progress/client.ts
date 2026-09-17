/**
 * Єдиний клієнтський шар прогресу: одне сховище на сторінку, події геймифікації, розсилка оновлень.
 * Стан — незмінний знімок із рушія; кожна зміна проходить через `store.save` і подію `ku:progress`.
 */
import { applyLearningEvent, type EventOutcome, type LearningEvent } from '../../engines/gamification';
import {
  createEmptyProgress,
  createLocalStorageProgressStore,
  type ProgressSaveResult,
  type ProgressState,
  type ProgressStore,
} from '../../engines/progress';
import type { Result } from '../../engines/shared/result';

export const PROGRESS_EVENT = 'ku:progress';

export interface ProgressChangeDetail {
  readonly state: ProgressState;
  /** Результат навчальної події; null для імпорту, скидання чи позначки «у процесі». */
  readonly outcome: EventOutcome | null;
  readonly persistent: boolean;
}

export interface ProgressError {
  readonly code: 'invalid-event' | 'limit-exceeded' | 'invalid-state' | 'too-large';
  readonly message: string;
}

export interface ProgressClient {
  getState(): ProgressState;
  /** Чи переживе прогрес перезавантаження сторінки (localStorage доступний і запис вдався). */
  isPersistent(): boolean;
  apply(event: LearningEvent): Result<EventOutcome, ProgressError>;
  /** Позначає тему як розпочату, не змінюючи XP. Завершену тему не чіпає. */
  markTopicInProgress(topicId: string): void;
  /** Заміна всього стану (імпорт коду прогресу). */
  replace(state: ProgressState): Result<ProgressState, ProgressError>;
  reset(): ProgressState;
  subscribe(listener: (detail: ProgressChangeDetail) => void): () => void;
}

const SAVE_ERROR_MESSAGES = {
  'invalid-state': 'Прогрес пошкоджений, зміну не записано. Оновіть сторінку і спробуйте ще раз.',
  'too-large': 'Прогресу забагато для сховища браузера — зміну не записано.',
} as const;

const GLOBAL_KEY = '__kuProgressClient';

function notify(detail: ProgressChangeDetail): void {
  document.dispatchEvent(new CustomEvent<ProgressChangeDetail>(PROGRESS_EVENT, { detail }));
}

export function createProgressClient(store: ProgressStore, now: () => Date = () => new Date()): ProgressClient {
  const loaded = store.load();
  let current: ProgressState = loaded.state;

  const persistent = () => store.isPersistent();

  function commit(state: ProgressState, outcome: EventOutcome | null): Result<ProgressState, ProgressError> {
    const saved: ProgressSaveResult = store.save(state);
    if (saved.status === 'rejected') {
      return { ok: false, error: { code: saved.reason, message: SAVE_ERROR_MESSAGES[saved.reason] } };
    }
    current = saved.state;
    notify({ state: current, outcome, persistent: persistent() });
    return { ok: true, value: current };
  }

  const client: ProgressClient = {
    getState: () => current,
    isPersistent: persistent,

    apply(event) {
      const applied = applyLearningEvent(current, event, now());
      if (!applied.ok) return { ok: false, error: applied.error };
      if (applied.value.duplicate) return { ok: true, value: applied.value };
      const committed = commit(applied.value.state, applied.value);
      if (!committed.ok) return committed;
      return { ok: true, value: { ...applied.value, state: committed.value } };
    },

    markTopicInProgress(topicId) {
      if (current.topics[topicId]) return;
      const stamp = now().toISOString();
      commit({ ...current, topics: { ...current.topics, [topicId]: { status: 'in-progress', updatedAt: stamp } } }, null);
    },

    replace(state) {
      return commit(state, null);
    },

    reset() {
      store.clear();
      current = createEmptyProgress(now());
      notify({ state: current, outcome: null, persistent: persistent() });
      return current;
    },

    subscribe(listener) {
      const handler = (event: Event) => listener((event as CustomEvent<ProgressChangeDetail>).detail);
      document.addEventListener(PROGRESS_EVENT, handler);
      return () => document.removeEventListener(PROGRESS_EVENT, handler);
    },
  };

  if (loaded.status === 'recovered') {
    // Пошкоджений запис: рушій уже поклав копію в резервний ключ, користувачу — коротке пояснення.
    queueMicrotask(() =>
      document.dispatchEvent(
        new CustomEvent('ku:toast', { detail: { text: 'Збережений прогрес не вдалося прочитати — розпочато з нуля. Копію збережено в браузері.' } }),
      ),
    );
  }
  return client;
}

function clientHolder(): Record<string, ProgressClient | undefined> {
  return globalThis as unknown as Record<string, ProgressClient | undefined>;
}

/** Один клієнт на сторінку, спільний для скриптів лейауту й React-островів (різні чанки, той самий об’єкт). */
export function getProgressClient(): ProgressClient {
  const holder = clientHolder();
  const existing = holder[GLOBAL_KEY];
  if (existing) return existing;
  const created = createProgressClient(createLocalStorageProgressStore());
  holder[GLOBAL_KEY] = created;
  return created;
}

/**
 * Підставляє інше сховище до першого `getProgressClient()`: пакет SCORM дає сховище над API LMS замість
 * localStorage, а острови лишаються без змін. Сайт її не викликає. Підміна вже створеного клієнта
 * розвела б острови по різних станах, тому це помилка програміста.
 */
export function installProgressStore(store: ProgressStore): ProgressClient {
  const holder = clientHolder();
  if (holder[GLOBAL_KEY]) throw new Error('Клієнт прогресу вже створено: сховище підставляють до першого getProgressClient().');
  const created = createProgressClient(store);
  holder[GLOBAL_KEY] = created;
  return created;
}
