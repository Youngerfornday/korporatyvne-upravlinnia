import { MAX_SERIALIZED_PROGRESS_LENGTH, deserializeProgress, serializeProgress } from './codec';
import type { ProgressState } from './state';

/** Код прогресу: префікс формату + base64url(JSON стану). */
export const PROGRESS_CODE_PREFIX = 'KUP1.';

/** Base64 збільшує розмір на третину; межа перевіряється до декодування. */
export const MAX_PROGRESS_CODE_LENGTH = PROGRESS_CODE_PREFIX.length + Math.ceil((MAX_SERIALIZED_PROGRESS_LENGTH * 4) / 3);

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

export function exportProgressCode(state: ProgressState): string {
  return PROGRESS_CODE_PREFIX + toBase64Url(new TextEncoder().encode(serializeProgress(state)));
}

export function importProgressCode(input: string): ProgressCodeImport {
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
