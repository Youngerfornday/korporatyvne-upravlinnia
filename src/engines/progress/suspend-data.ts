import { deflateSync, inflateSync, strFromU8, strToU8 } from 'fflate';
import { MAX_SERIALIZED_PROGRESS_LENGTH, serializeProgress, type DecodeError } from './codec';
import type { ProgressState } from './state';

/**
 * Упаковка стану прогресу в `cmi.suspend_data` SCORM 1.2 (CMIString4096). Короткий JSON лишається як є;
 * довгий стискається (deflate + base64 з префіксом); якщо й так не вміщається — відкидаються найстаріші
 * ID оброблених подій. Ця історія лише захищає від повторного застосування події, а XP і рекорди
 * рушій геймифікації однаково не дає нарахувати двічі (журнал XP, найкращий результат).
 */

export const SCORM_SUSPEND_DATA_LIMIT = 4096;

/** JSON завжди починається з `{`, тож префікс однозначно відрізняє стиснений запис. */
export const COMPRESSED_PREFIX = 'z1:';

const DEFLATE_LEVEL = 9;

function toBase64(bytes: Uint8Array): string {
  return btoa(Array.from(bytes, (byte) => String.fromCharCode(byte)).join(''));
}

function fromBase64(text: string): Uint8Array {
  return Uint8Array.from(atob(text), (char) => char.charCodeAt(0));
}

/** Рядок для suspend_data або null, якщо навіть стиснений JSON довший за межу. */
export function encodeSuspendData(json: string, limit: number): string | null {
  if (json.length <= limit) return json;
  const packed = COMPRESSED_PREFIX + toBase64(deflateSync(strToU8(json), { level: DEFLATE_LEVEL }));
  return packed.length <= limit ? packed : null;
}

export type SuspendDataDecode = { readonly ok: true; readonly json: string } | { readonly ok: false; readonly error: Extract<DecodeError, 'too-large' | 'invalid-json'> };

/** Розпаковує suspend_data у JSON. Розпакування обмежене межею стану, тож «бомба» не з'їсть пам'ять. */
export function decodeSuspendData(raw: string): SuspendDataDecode {
  if (raw.length > SCORM_SUSPEND_DATA_LIMIT) return { ok: false, error: 'too-large' };
  if (!raw.startsWith(COMPRESSED_PREFIX)) return { ok: true, json: raw };
  try {
    const out = inflateSync(fromBase64(raw.slice(COMPRESSED_PREFIX.length)), { out: new Uint8Array(MAX_SERIALIZED_PROGRESS_LENGTH * 4 + 1) });
    const json = strFromU8(out);
    return json.length > MAX_SERIALIZED_PROGRESS_LENGTH ? { ok: false, error: 'too-large' } : { ok: true, json };
  } catch {
    // Пошкоджений base64 або потік deflate — для викликача це нечитабельний запис.
    return { ok: false, error: 'invalid-json' };
  }
}

export type FittedSuspendData =
  | { readonly ok: true; readonly state: ProgressState; readonly data: string; readonly droppedEvents: number }
  | { readonly ok: false };

/** Найбільша історія подій, з якою стан уміщається в межу. Вхідний стан не змінюється. */
export function fitSuspendData(state: ProgressState, limit: number = SCORM_SUSPEND_DATA_LIMIT): FittedSuspendData {
  const events = state.recentEventIds;
  for (let dropped = 0; dropped <= events.length; dropped += 1) {
    const candidate = dropped === 0 ? state : { ...state, recentEventIds: events.slice(dropped) };
    const data = encodeSuspendData(serializeProgress(candidate), limit);
    if (data !== null) return { ok: true, state: candidate, data, droppedEvents: dropped };
  }
  return { ok: false };
}
