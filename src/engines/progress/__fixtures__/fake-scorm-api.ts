import type { Scorm12Api } from '../scorm-api';

/**
 * Імітація SCORM 1.2 API LMS у дусі Moodle 5.2 (mod/scorm/datamodels/scorm_12.js): формати значень,
 * коди помилок 301/405/403/201, фіксація лише на LMSCommit/LMSFinish і «перезапуск» з тими даними,
 * які LMS встигла записати.
 */

const CMI_DECIMAL = /^-?([0-9]{0,3})(\.[0-9]*)?$/;
const CMI_STATUS = /^(passed|completed|failed|incomplete|browsed)$/;
const CMI_EXIT = /^(time-out|suspend|logout|)$/;
const CMI_TIMESPAN = /^([0-9]{2,4}):([0-9]{2}):([0-9]{2})(\.[0-9]{1,2})?$/;
const CMI_STRING_4096 = 4096;

type Validator = (value: string) => boolean;

const WRITABLE: Readonly<Record<string, Validator>> = {
  'cmi.suspend_data': (value) => value.length <= CMI_STRING_4096,
  'cmi.core.score.raw': (value) => CMI_DECIMAL.test(value),
  'cmi.core.score.min': (value) => CMI_DECIMAL.test(value),
  'cmi.core.score.max': (value) => CMI_DECIMAL.test(value),
  'cmi.core.lesson_status': (value) => CMI_STATUS.test(value),
  'cmi.core.exit': (value) => CMI_EXIT.test(value),
  'cmi.core.session_time': (value) => CMI_TIMESPAN.test(value),
};

const READ_ONLY = new Set(['cmi.student_data.mastery_score', 'cmi.core.entry', 'cmi.core.student_id']);

export interface FakeScormOptions {
  readonly suspendData?: string;
  readonly lessonStatus?: string;
  readonly masteryScore?: string;
  /** LMSInitialize повертає 'false'. */
  readonly failInitialize?: boolean;
  /** Елементи, запис яких LMS відхиляє з кодом 101 (збій сервера). */
  readonly failSetOn?: readonly string[];
  readonly failCommit?: boolean;
  /** Усі значення, збережені попереднім запуском (для relaunch). */
  readonly restored?: Readonly<Record<string, string>>;
}

export interface FakeScormApi extends Scorm12Api {
  readonly calls: readonly string[];
  /** Значення, які LMS уже зберегла (після LMSCommit або LMSFinish). */
  readonly persisted: () => Readonly<Record<string, string>>;
  readonly initialized: () => boolean;
  readonly finished: () => boolean;
  /** Новий запуск SCO з даними, які LMS зберегла в попередньому. */
  readonly relaunch: (options?: Omit<FakeScormOptions, 'suspendData' | 'lessonStatus' | 'restored'>) => FakeScormApi;
  setCommitFailing(failing: boolean): void;
}

export function createFakeScormApi(options: FakeScormOptions = {}): FakeScormApi {
  const stored: Record<string, string> = {
    'cmi.suspend_data': options.suspendData ?? '',
    'cmi.core.lesson_status': options.lessonStatus ?? 'not attempted',
    'cmi.core.score.raw': '',
    'cmi.core.score.min': '',
    'cmi.core.score.max': '',
    'cmi.core.exit': '',
    'cmi.core.entry': options.suspendData ? 'resume' : 'ab-initio',
    'cmi.student_data.mastery_score': options.masteryScore ?? '',
    ...options.restored,
  };
  let working: Record<string, string> = { ...stored };
  let initialized = false;
  let finished = false;
  let failCommit = options.failCommit ?? false;
  let lastError = '0';
  const calls: string[] = [];
  const failSet = new Set(options.failSetOn ?? []);

  const result = (ok: boolean, code: string): string => {
    lastError = ok ? '0' : code;
    return ok ? 'true' : 'false';
  };
  const persist = (): void => {
    Object.assign(stored, working);
  };

  return {
    LMSInitialize(parameter) {
      calls.push('LMSInitialize');
      if (parameter !== '') return result(false, '201');
      if (initialized) return result(false, '101');
      if (options.failInitialize) return result(false, '101');
      initialized = true;
      return result(true, '0');
    },
    LMSFinish(parameter) {
      calls.push('LMSFinish');
      if (!initialized) return result(false, '301');
      if (parameter !== '') return result(false, '201');
      initialized = false;
      finished = true;
      persist();
      return result(true, '0');
    },
    LMSGetValue(element) {
      calls.push(`LMSGetValue ${element}`);
      if (!initialized) {
        lastError = '301';
        return '';
      }
      const value = working[element];
      if (value === undefined) {
        lastError = '401';
        return '';
      }
      lastError = '0';
      return value;
    },
    LMSSetValue(element, value) {
      calls.push(`LMSSetValue ${element}`);
      if (!initialized) return result(false, '301');
      if (READ_ONLY.has(element)) return result(false, '403');
      const validate = WRITABLE[element];
      if (!validate) return result(false, '401');
      if (failSet.has(element)) return result(false, '101');
      if (!validate(String(value))) return result(false, '405');
      working = { ...working, [element]: String(value) };
      return result(true, '0');
    },
    LMSCommit(parameter) {
      calls.push('LMSCommit');
      if (!initialized) return result(false, '301');
      if (parameter !== '') return result(false, '201');
      if (failCommit) return result(false, '101');
      persist();
      return result(true, '0');
    },
    LMSGetLastError() {
      return lastError;
    },
    LMSGetErrorString(code) {
      return `error ${String(code)}`;
    },
    calls,
    persisted: () => ({ ...stored }),
    initialized: () => initialized,
    finished: () => finished,
    relaunch: (next = {}) =>
      createFakeScormApi({
        ...options,
        ...next,
        restored: { ...stored, 'cmi.core.entry': stored['cmi.core.exit'] === 'suspend' ? 'resume' : '', 'cmi.core.exit': '' },
      }),
    setCommitFailing(failing) {
      failCommit = failing;
    },
  };
}
