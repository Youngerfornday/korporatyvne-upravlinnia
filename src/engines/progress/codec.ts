import { PROGRESS_MIGRATIONS, migrateProgress, type MigrationError, type MigrationTable } from './migrations';
import { ProgressStateSchema, type ProgressState } from './state';

/** Верхня межа серіалізованого стану в символах; перевіряється до JSON.parse. */
export const MAX_SERIALIZED_PROGRESS_LENGTH = 48_000;

export type DecodeError = 'too-large' | 'invalid-json' | MigrationError;

export type DecodeOutcome =
  | { readonly ok: true; readonly state: ProgressState; readonly migrated: boolean }
  | { readonly ok: false; readonly error: DecodeError };

/** Серіалізує лише валідний стан; невалідний — помилка програміста. */
export function serializeProgress(state: ProgressState): string {
  const parsed = ProgressStateSchema.safeParse(state);
  if (!parsed.success) {
    throw new Error(`Некоректний стан прогресу: ${parsed.error.issues.map((issue) => issue.message).join('; ')}`);
  }
  return JSON.stringify(parsed.data);
}

export function deserializeProgress(
  raw: string,
  migrations: MigrationTable = PROGRESS_MIGRATIONS,
  maxLength: number = MAX_SERIALIZED_PROGRESS_LENGTH,
): DecodeOutcome {
  if (raw.length > maxLength) return { ok: false, error: 'too-large' };

  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return { ok: false, error: 'invalid-json' };
  }
  return migrateProgress(data, migrations);
}
