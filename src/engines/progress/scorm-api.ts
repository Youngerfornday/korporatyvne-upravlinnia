/**
 * SCORM 1.2 Run-Time Environment: інтерфейс об'єкта `API`, який LMS кладе у вікно-предок SCO,
 * його стандартний пошук (ADL SCORM 1.2 RTE, розділ 3.3.6.1) і формат часу CMITimespan.
 */

/** Методи SCORM 1.2 API. LMS повертають логічні значення рядками 'true'/'false'; деякі — булевими. */
export interface Scorm12Api {
  LMSInitialize(parameter: ''): string | boolean;
  LMSFinish(parameter: ''): string | boolean;
  LMSGetValue(element: string): string;
  LMSSetValue(element: string, value: string): string | boolean;
  LMSCommit(parameter: ''): string | boolean;
  LMSGetLastError(): string | number;
  LMSGetErrorString?(code: string | number): string;
}

/** Мінімум вікна, потрібний для пошуку API; звернення до властивостей чужого origin кидає SecurityError. */
export interface ScormWindowLike {
  readonly API?: unknown;
  readonly parent?: ScormWindowLike | null;
  readonly opener?: ScormWindowLike | null;
}

/** Скільки разів алгоритм ADL піднімається до батьківського вікна, перш ніж здатися. */
export const MAX_API_SEARCH_DEPTH = 7;

const API_METHODS = ['LMSInitialize', 'LMSFinish', 'LMSGetValue', 'LMSSetValue', 'LMSCommit', 'LMSGetLastError'] as const;

function asApi(candidate: unknown): Scorm12Api | null {
  if (typeof candidate !== 'object' || candidate === null) return null;
  const record = candidate as Record<string, unknown>;
  return API_METHODS.every((method) => typeof record[method] === 'function') ? (candidate as Scorm12Api) : null;
}

function searchUp(start: ScormWindowLike): Scorm12Api | null {
  let current = start;
  for (let hops = 0; ; hops += 1) {
    const api = asApi(current.API);
    if (api) return api;
    const parent = current.parent;
    if (!parent || parent === current || hops >= MAX_API_SEARCH_DEPTH) return null;
    current = parent;
  }
}

/** Стандартний пошук: саме вікно і його предки, потім вікно, що відкрило спливне вікно SCO. */
export function findScormApi(win: ScormWindowLike | null | undefined): Scorm12Api | null {
  if (!win) return null;
  try {
    const own = searchUp(win);
    if (own) return own;
    const opener = win.opener;
    return opener ? searchUp(opener) : null;
  } catch {
    // Вікно-предок з іншого origin: API там недосяжний, пакет працює без LMS.
    return null;
  }
}

export function isScormTrue(value: unknown): boolean {
  return value === true || value === 'true';
}

const MS_PER_CENTISECOND = 10;
const CENTISECONDS_PER_SECOND = 100;
const SECONDS_PER_MINUTE = 60;
const MINUTES_PER_HOUR = 60;
const MAX_HOURS = 9999;

const pad = (value: number, length: number): string => String(value).padStart(length, '0');

/** CMITimespan `HHHH:MM:SS.SS` (cmi.core.session_time); некоректне значення — нуль, завелике — максимум формату. */
export function cmiTimespan(milliseconds: number): string {
  const safe = Number.isFinite(milliseconds) && milliseconds > 0 ? milliseconds : 0;
  const maxCentiseconds = ((MAX_HOURS * MINUTES_PER_HOUR + MINUTES_PER_HOUR - 1) * SECONDS_PER_MINUTE + SECONDS_PER_MINUTE - 1) * CENTISECONDS_PER_SECOND + CENTISECONDS_PER_SECOND - 1;
  const total = Math.min(Math.floor(safe / MS_PER_CENTISECOND), maxCentiseconds);
  const centiseconds = total % CENTISECONDS_PER_SECOND;
  const seconds = Math.floor(total / CENTISECONDS_PER_SECOND) % SECONDS_PER_MINUTE;
  const minutes = Math.floor(total / (CENTISECONDS_PER_SECOND * SECONDS_PER_MINUTE)) % MINUTES_PER_HOUR;
  const hours = Math.floor(total / (CENTISECONDS_PER_SECOND * SECONDS_PER_MINUTE * MINUTES_PER_HOUR));
  return `${pad(hours, 4)}:${pad(minutes, 2)}:${pad(seconds, 2)}.${pad(centiseconds, 2)}`;
}
