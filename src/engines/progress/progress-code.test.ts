import { describe, expect, it } from 'vitest';
import { FIXED_NOW, sampleProgress } from './__fixtures__/sample-state';
import {
  MAX_PROGRESS_CODE_INPUT_LENGTH,
  MAX_PROGRESS_CODE_LENGTH,
  PROGRESS_CODE_ERROR_MESSAGES,
  PROGRESS_CODE_EXPORT_ERROR_MESSAGES,
  PROGRESS_CODE_PREFIX,
  exportProgressCode,
  importProgressCode,
  type ProgressCodeError,
} from './progress-code';

function encodeRaw(json: string): string {
  const bytes = new TextEncoder().encode(json);
  const binary = Array.from(bytes, (byte) => String.fromCharCode(byte)).join('');
  return PROGRESS_CODE_PREFIX + btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function exportCode(state = sampleProgress()): string {
  const result = exportProgressCode(state);
  if (!result.ok) throw new Error(result.error);
  return result.code;
}

describe('exportProgressCode', () => {
  it('produces a prefixed URL-safe code', () => {
    // Act
    const code = exportCode();

    // Assert
    expect(code.startsWith(PROGRESS_CODE_PREFIX)).toBe(true);
    expect(code.slice(PROGRESS_CODE_PREFIX.length)).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it('refuses a valid state that its own importer could not accept because of size', () => {
    // Arrange
    const flashcards = Object.fromEntries(
      Array.from({ length: 1000 }, (_, index) => [`term-with-a-long-identifier-${index}`, { box: 1, reviewedAt: FIXED_NOW.toISOString() }]),
    );

    // Act
    const result = exportProgressCode({ ...sampleProgress(), flashcards });

    // Assert
    expect(result).toEqual({ ok: false, error: 'too-large' });
  });

  it('reports an invalid state as a typed error instead of throwing', () => {
    expect(exportProgressCode({ ...sampleProgress(), xp: -1 })).toEqual({ ok: false, error: 'invalid-state' });
  });

  it('has a Ukrainian message for every export error', () => {
    expect(PROGRESS_CODE_EXPORT_ERROR_MESSAGES['too-large']).toMatch(/[а-яіїєґ]/i);
    expect(PROGRESS_CODE_EXPORT_ERROR_MESSAGES['invalid-state']).toMatch(/[а-яіїєґ]/i);
  });
});

describe('importProgressCode', () => {
  it('restores exactly the exported state', () => {
    // Arrange
    const state = sampleProgress();

    // Act
    const result = importProgressCode(exportCode(state));

    // Assert
    expect(result).toEqual({ ok: true, migrated: false, state });
  });

  it('tolerates whitespace and line breaks added while copying', () => {
    // Arrange
    const code = exportCode();
    const pasted = `  ${code.slice(0, 20)}\n${code.slice(20, 40)} \t${code.slice(40)}\n`;

    // Act
    const result = importProgressCode(pasted);

    // Assert
    expect(result.ok).toBe(true);
  });

  it('rejects an empty code', () => {
    expect(importProgressCode('   ')).toEqual({ ok: false, error: 'empty' });
  });

  it('rejects oversized raw input before stripping whitespace from it', () => {
    // Arrange
    const padded = ' '.repeat(MAX_PROGRESS_CODE_INPUT_LENGTH) + exportCode();

    // Act and Assert
    expect(importProgressCode(padded)).toEqual({ ok: false, error: 'too-large' });
    expect(MAX_PROGRESS_CODE_INPUT_LENGTH).toBe(2 * MAX_PROGRESS_CODE_LENGTH);
  });

  it('rejects a code longer than the limit without decoding it', () => {
    // Arrange
    const code = PROGRESS_CODE_PREFIX + 'A'.repeat(MAX_PROGRESS_CODE_LENGTH);

    // Act and Assert
    expect(importProgressCode(code)).toEqual({ ok: false, error: 'too-large' });
  });

  it.each([
    ['wrong prefix', 'XYZ1.eyJ9'],
    ['characters outside base64url', `${PROGRESS_CODE_PREFIX}abc$def`],
    ['impossible base64 length', `${PROGRESS_CODE_PREFIX}A`],
    ['bytes that are not UTF-8', `${PROGRESS_CODE_PREFIX}_w`],
    ['payload that is not JSON', encodeRaw('not json')],
  ])('rejects %s as invalid-format', (_label, code) => {
    expect(importProgressCode(code)).toEqual({ ok: false, error: 'invalid-format' });
  });

  it('rejects well-formed JSON that is not a valid progress state', () => {
    expect(importProgressCode(encodeRaw('{"schemaVersion":2,"xp":"lots"}'))).toEqual({
      ok: false,
      error: 'invalid-data',
    });
  });

  it('reports a code created by a newer version of the site', () => {
    expect(importProgressCode(encodeRaw('{"schemaVersion":42}'))).toEqual({ ok: false, error: 'future-version' });
  });

  it('has a Ukrainian message for every error code', () => {
    // Arrange
    const errors: ProgressCodeError[] = ['empty', 'too-large', 'invalid-format', 'invalid-data', 'future-version'];

    // Assert
    for (const error of errors) {
      expect(PROGRESS_CODE_ERROR_MESSAGES[error]).toMatch(/[а-яіїєґ]/i);
    }
  });
});
