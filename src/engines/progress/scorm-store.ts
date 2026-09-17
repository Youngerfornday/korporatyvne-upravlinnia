import { toScormCmiValues, type ScormLessonStatus } from '../quiz/report';
import { roundTo } from '../shared/number-format';
import { MAX_SERIALIZED_PROGRESS_LENGTH, deserializeProgress } from './codec';
import { PROGRESS_MIGRATIONS, type MigrationTable } from './migrations';
import { prepareForSave } from './prepare-save';
import { cmiTimespan, findScormApi, isScormTrue, type Scorm12Api, type ScormWindowLike } from './scorm-api';
import { createEmptyProgress, type ProgressState } from './state';
import type { ProgressLoadResult, ProgressSaveResult, ProgressStore, ProgressStoreOptions } from './store';
import { SCORM_SUSPEND_DATA_LIMIT, decodeSuspendData, fitSuspendData } from './suspend-data';

/**
 * ProgressStore над SCORM 1.2 API (пакети тренажерів для Moodle). Увесь стан — у `cmi.suspend_data`;
 * результат тренажера `activityId` — у `cmi.core.score.*` і `cmi.core.lesson_status` за порогом рубрики.
 * Кожне збереження одразу фіксується `LMSCommit`, тож результат не губиться, навіть якщо LMS не встигне
 * обробити вихід зі сторінки; на `pagehide` сесія завершується `LMSFinish` (attachScormLifecycle).
 * Без API або після збою LMS дані живуть у пам'яті сторінки, а викликач отримує повідомлення onNotice.
 */

export type ScormNotice =
  | { readonly code: 'no-api' }
  | { readonly code: 'initialize-failed'; readonly error: string }
  | { readonly code: 'lms-error'; readonly operation: string; readonly error: string }
  | { readonly code: 'history-trimmed'; readonly droppedEvents: number }
  | { readonly code: 'too-large' };

export interface ScormProgressStoreOptions extends ProgressStoreOptions {
  /** ID активності в `ProgressState.activities`, чий найкращий результат — бал SCO. */
  readonly activityId: string;
  /** Прохідний бал 0..100 з рубрики (той самий, що `adlcp:masteryscore` у маніфесті пакета). */
  readonly masteryPercent: number;
  readonly getApi?: () => Scorm12Api | null;
  readonly suspendDataLimit?: number;
  readonly migrations?: MigrationTable;
  readonly onNotice?: (notice: ScormNotice) => void;
}

export interface ScormProgressStore extends ProgressStore {
  /** Фіксує дані й завершує сесію LMS (LMSFinish). Повторний виклик нічого не робить. */
  terminate(): void;
}

type Session = { readonly kind: 'lms'; readonly api: Scorm12Api; readonly startedAt: number } | { readonly kind: 'memory' };

const NOT_ATTEMPTED = new Set(['', 'not attempted']);
const FULL_PERCENT = 100;
const SCORE_DECIMALS = 2;

const defaultGetApi = (): Scorm12Api | null => findScormApi(globalThis as unknown as ScormWindowLike);

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function createScormProgressStore(options: ScormProgressStoreOptions): ScormProgressStore {
  const getApi = options.getApi ?? defaultGetApi;
  const now = options.now ?? (() => new Date());
  const maxLength = options.maxSerializedLength ?? MAX_SERIALIZED_PROGRESS_LENGTH;
  const limit = options.suspendDataLimit ?? SCORM_SUSPEND_DATA_LIMIT;
  const migrations = options.migrations ?? PROGRESS_MIGRATIONS;
  const notify = options.onNotice ?? (() => undefined);

  let session: Session | null = null;
  let terminated = false;
  let mastery = options.masteryPercent;
  /** Стан, якого немає в LMS (немає API або запис не вдався); має пріоритет над suspend_data. */
  let unsaved: ProgressState | null = null;

  /** Виклик методу API; збій (false або виняток) — повідомлення й false. */
  function call(api: Scorm12Api, operation: string, run: () => unknown): boolean {
    try {
      if (isScormTrue(run())) return true;
      notify({ code: 'lms-error', operation, error: String(api.LMSGetLastError()) });
    } catch (error) {
      notify({ code: 'lms-error', operation, error: errorText(error) });
    }
    return false;
  }

  function read(api: Scorm12Api, element: string): string | null {
    try {
      return api.LMSGetValue(element);
    } catch (error) {
      notify({ code: 'lms-error', operation: `LMSGetValue ${element}`, error: errorText(error) });
      return null;
    }
  }

  function open(): Session {
    const api = getApi();
    if (!api) {
      notify({ code: 'no-api' });
      return { kind: 'memory' };
    }
    try {
      if (!isScormTrue(api.LMSInitialize(''))) {
        notify({ code: 'initialize-failed', error: String(api.LMSGetLastError()) });
        return { kind: 'memory' };
      }
    } catch (error) {
      notify({ code: 'initialize-failed', error: errorText(error) });
      return { kind: 'memory' };
    }
    const masteryValue = read(api, 'cmi.student_data.mastery_score');
    if (masteryValue === null) return { kind: 'memory' };
    const lmsMastery = Number.parseFloat(masteryValue);
    if (Number.isFinite(lmsMastery)) mastery = lmsMastery;
    // Перший запуск: LMS одразу бачить спробу розпочатою, навіть якщо студент нічого не завершить.
    const lessonStatus = read(api, 'cmi.core.lesson_status');
    if (lessonStatus === null) return { kind: 'memory' };
    if (NOT_ATTEMPTED.has(lessonStatus)) {
      write(api, [['cmi.core.lesson_status', 'incomplete']]);
    }
    return { kind: 'lms', api, startedAt: now().getTime() };
  }

  function current(): Session {
    if (terminated) return { kind: 'memory' };
    session ??= open();
    return session;
  }

  /** Бал і статус SCO з найкращого результату тренажера; без результату — лише `incomplete`. */
  function resultValues(state: ProgressState): ReadonlyArray<readonly [string, string]> {
    const activity = state.activities[options.activityId];
    if (!activity) return [['cmi.core.lesson_status', 'incomplete']];
    const scoreRaw = roundTo(activity.bestScore * FULL_PERCENT, SCORE_DECIMALS);
    const lessonStatus: ScormLessonStatus = scoreRaw >= mastery ? 'passed' : 'failed';
    return Object.entries(toScormCmiValues({ scoreRaw, scoreMin: 0, scoreMax: FULL_PERCENT, lessonStatus }));
  }

  function write(api: Scorm12Api, values: ReadonlyArray<readonly [string, string]>): boolean {
    return (
      values.every(([element, value]) => call(api, `LMSSetValue ${element}`, () => api.LMSSetValue(element, value))) &&
      call(api, 'LMSCommit', () => api.LMSCommit(''))
    );
  }

  function keepInMemory(state: ProgressState, reason: 'unavailable' | 'write-failed'): ProgressSaveResult {
    unsaved = state;
    return { status: 'memory-only', reason, state: structuredClone(state) };
  }

  return {
    load(): ProgressLoadResult {
      const active = current();
      if (unsaved !== null) return { status: 'memory-only', state: structuredClone(unsaved) };
      if (active.kind === 'memory') return { status: 'empty', state: createEmptyProgress(now()) };

      const raw = read(active.api, 'cmi.suspend_data');
      if (raw === null) {
        session = { kind: 'memory' };
        return { status: 'memory-only', state: createEmptyProgress(now()) };
      }
      if (raw === '') return { status: 'empty', state: createEmptyProgress(now()) };
      const unpacked = decodeSuspendData(raw);
      const decoded = unpacked.ok ? deserializeProgress(unpacked.json, migrations, maxLength) : unpacked;
      if (!decoded.ok) return { status: 'recovered', issue: decoded.error, backupSaved: false, state: createEmptyProgress(now()) };
      return { status: decoded.migrated ? 'migrated' : 'loaded', state: decoded.state };
    },

    save(state): ProgressSaveResult {
      const prepared = prepareForSave(state, now(), maxLength);
      if (!prepared.ok) return { status: 'rejected', reason: prepared.reason };
      const fitted = fitSuspendData(prepared.state, limit);
      if (!fitted.ok) {
        notify({ code: 'too-large' });
        return { status: 'rejected', reason: 'too-large' };
      }
      if (fitted.droppedEvents > 0) notify({ code: 'history-trimmed', droppedEvents: fitted.droppedEvents });

      const active = current();
      if (active.kind === 'memory') return keepInMemory(fitted.state, 'unavailable');
      const values: ReadonlyArray<readonly [string, string]> = [['cmi.suspend_data', fitted.data], ...resultValues(fitted.state), ['cmi.core.exit', 'suspend']];
      if (!write(active.api, values)) return keepInMemory(fitted.state, 'write-failed');
      unsaved = null;
      return { status: 'saved', state: structuredClone(fitted.state) };
    },

    clear() {
      unsaved = null;
      const active = current();
      if (active.kind === 'memory') return { status: 'memory-only' };
      return write(active.api, [['cmi.suspend_data', '']]) ? { status: 'cleared' } : { status: 'memory-only' };
    },

    flush() {
      if (session?.kind !== 'lms' || terminated) return;
      const { api } = session;
      call(api, 'LMSCommit', () => api.LMSCommit(''));
    },

    terminate() {
      if (session?.kind !== 'lms' || terminated) return;
      const { api, startedAt } = session;
      terminated = true;
      const finalValues: ReadonlyArray<readonly [string, string]> = [
        ['cmi.core.exit', 'suspend'],
        ['cmi.core.session_time', cmiTimespan(now().getTime() - startedAt)],
      ];
      if (unsaved !== null) {
        const fitted = fitSuspendData(unsaved, limit);
        if (!fitted.ok) {
          notify({ code: 'too-large' });
          return;
        }
        if (!write(api, [['cmi.suspend_data', fitted.data], ...resultValues(fitted.state), ...finalValues])) return;
        unsaved = null;
      } else {
        write(api, finalValues);
      }
      call(api, 'LMSFinish', () => api.LMSFinish(''));
    },

    isPersistent: () => current().kind === 'lms' && unsaved === null,
  };
}

export interface LifecycleTarget {
  addEventListener(type: 'pagehide', listener: () => void): void;
  removeEventListener(type: 'pagehide', listener: () => void): void;
}

/** Завершує сесію SCORM, коли сторінку SCO закривають (вихід з плеєра Moodle, закриття вкладки). */
export function attachScormLifecycle(store: Pick<ScormProgressStore, 'terminate'>, target: LifecycleTarget): () => void {
  const onPageHide = (): void => store.terminate();
  target.addEventListener('pagehide', onPageHide);
  return () => target.removeEventListener('pagehide', onPageHide);
}

const NOTICE_TEXTS = {
  'no-api': 'Пакет відкрито не в Moodle: результат збережеться лише до закриття сторінки й не потрапить у журнал оцінок.',
  'initialize-failed': 'Moodle не відкрив сесію SCORM: результат збережеться лише до закриття сторінки. Оновіть сторінку або повідомте викладача.',
  'lms-error': 'Moodle не прийняв результат. Не закривайте сторінку, спробуйте ще раз або повідомте викладача.',
  'history-trimmed': 'Прогрес тренажера наблизився до межі SCORM: найстаріші записи історії спроб видалено, бал і результати збережено.',
  'too-large': 'Прогрес не вміщається в межу SCORM, тому зміну не передано в Moodle.',
} as const satisfies Record<ScormNotice['code'], string>;

export function scormNoticeText(notice: ScormNotice): string {
  return NOTICE_TEXTS[notice.code];
}
