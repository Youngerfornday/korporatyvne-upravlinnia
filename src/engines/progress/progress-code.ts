import { MAX_SERIALIZED_PROGRESS_LENGTH, deserializeProgress } from './codec';
import { ProgressStateSchema, type ProgressState } from './state';

/** Код прогресу: префікс формату + base64url(JSON стану). */
export const PROGRESS_CODE_PREFIX = 'KUP1.';

/** Base64 збільшує розмір на третину; межа перевіряється до декодування. */
export const MAX_PROGRESS_CODE_LENGTH = PROGRESS_CODE_PREFIX.length + Math.ceil((MAX_SERIALIZED_PROGRESS_LENGTH * 4) / 3);

/**
 * Межа сирого вставленого тексту, перевіряється ДО нормалізації пробілів: інакше мегабайти пробілів
 * спершу копіюються в replace. Запас удвічі — на переноси рядків і пробіли при копіюванні.
 */
export const MAX_PROGRESS_CODE_INPUT_LENGTH = 2 * MAX_PROGRESS_CODE_LENGTH;

export type ProgressCodeError = 'empty' | 'too-large' | 'invalid-format' | 'invalid-data' | 'future-version';

export type ProgressCodeImport =
  | { readonly ok: true; readonly state: ProgressState; readonly migrated: boolean }
  | { readonly ok: false; readonly error: ProgressCodeError };

export const PROGRESS_CODE_ERROR_MESSAGES: Readonly<Record<ProgressCodeError, string>> = {
  empty: 'Вставте код прогресу.',
  'too-large': 'Код задовгий. Перевірте, чи скопійовано саме код прогресу цього курсу.',
  'invalid-format': 'Код пошкоджений або не належить цьому курсу. Скопіюйте його ще раз повністю.',
  'invalid-data': 'Код прочитано, але дані в ньому некоректні. Прогрес не змінено.',
  'future-version': 'Код створено новішою версією сайту. Оновіть сторінку і спробуйте ще раз.',
};

export type ProgressCodeExportError = 'invalid-state' | 'too-large';

export type ProgressCodeExport =
  | { readonly ok: true; readonly code: string }
  | { readonly ok: false; readonly error: ProgressCodeExportError };

export const PROGRESS_CODE_EXPORT_ERROR_MESSAGES: Readonly<Record<ProgressCodeExportError, string>> = {
  'invalid-state': 'Прогрес пошкоджений, тому код не створено. Оновіть сторінку і спробуйте ще раз.',
  'too-large': 'Прогресу забагато для одного коду. Скиньте прогрес карток, які вже не потрібні, і спробуйте ще раз.',
};

const BASE64URL_PATTERN = /^[A-Za-z0-9_-]+$/;
const BASE64_BLOCK = 4;

function toBase64Url(bytes: Uint8Array): string {
  const binary = Array.from(bytes, (byte) => String.fromCharCode(byte)).join('');
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function decodeBase64UrlText(encoded: string): string | null {
  if (!BASE64URL_PATTERN.test(encoded)) return null;
  const padding = '='.repeat((BASE64_BLOCK - (encoded.length % BASE64_BLOCK)) % BASE64_BLOCK);
  try {
    const binary = atob(encoded.replace(/-/g, '+').replace(/_/g, '/') + padding);
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    // Неможлива довжина base64 або байти не в UTF-8 — це пошкоджений код, а не збій програми.
    return null;
  }
}

/** Створює код лише для стану, який власний importProgressCode зможе прочитати (та сама межа розміру). */
export function exportProgressCode(state: ProgressState): ProgressCodeExport {
  const parsed = ProgressStateSchema.safeParse(state);
  if (!parsed.success) return { ok: false, error: 'invalid-state' };
  const json = JSON.stringify(parsed.data);
  if (json.length > MAX_SERIALIZED_PROGRESS_LENGTH) return { ok: false, error: 'too-large' };
  return { ok: true, code: PROGRESS_CODE_PREFIX + toBase64Url(new TextEncoder().encode(json)) };
}

export function importProgressCode(input: string): ProgressCodeImport {
  if (input.length > MAX_PROGRESS_CODE_INPUT_LENGTH) return { ok: false, error: 'too-large' };
  const code = input.replace(/\s+/g, '');
  if (code.length === 0) return { ok: false, error: 'empty' };
  if (code.length > MAX_PROGRESS_CODE_LENGTH) return { ok: false, error: 'too-large' };
  if (!code.startsWith(PROGRESS_CODE_PREFIX)) return { ok: false, error: 'invalid-format' };

  const json = decodeBase64UrlText(code.slice(PROGRESS_CODE_PREFIX.length));
  if (json === null) return { ok: false, error: 'invalid-format' };

  const decoded = deserializeProgress(json);
  if (decoded.ok) return decoded;

  switch (decoded.error) {
    case 'too-large':
      return { ok: false, error: 'too-large' };
    case 'future-version':
      return { ok: false, error: 'future-version' };
    case 'invalid-json':
      return { ok: false, error: 'invalid-format' };
    default:
      return { ok: false, error: 'invalid-data' };
  }
}
