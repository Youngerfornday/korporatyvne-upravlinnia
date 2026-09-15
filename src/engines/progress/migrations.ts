import { migrateV1ToV2 } from './migrate-v1-to-v2';
import { PROGRESS_SCHEMA_VERSION, ProgressStateSchema, type ProgressState } from './state';

/** Перетворює дані версії N на дані версії N + 1. Не повинна мутувати вхід. */
export type Migration = (input: Readonly<Record<string, unknown>>) => Record<string, unknown>;

/** Ключ — версія, З ЯКОЇ виконується міграція. */
export type MigrationTable = Readonly<Record<number, Migration>>;

/**
 * Міграції збережених даних прогресу. Додаючи версію N + 1: підняти PROGRESS_SCHEMA_VERSION,
 * заморозити схему версії N окремим файлом і додати сюди `N: (vN) => vN+1`.
 */
export const PROGRESS_MIGRATIONS: MigrationTable = { 1: migrateV1ToV2 };

export type MigrationError = 'not-object' | 'missing-version' | 'future-version' | 'missing-migration' | 'invalid-data';

export type MigrationOutcome =
  | { readonly ok: true; readonly state: ProgressState; readonly migrated: boolean }
  | { readonly ok: false; readonly error: MigrationError };

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readVersion(data: Record<string, unknown>): number | null {
  const version = data['schemaVersion'];
  return Number.isInteger(version) && (version as number) >= 0 ? (version as number) : null;
}

function applyMigration(migration: Migration, data: Record<string, unknown>): Record<string, unknown> | null {
  try {
    const next = migration(structuredClone(data));
    return isPlainObject(next) ? next : null;
  } catch {
    // Зламана міграція трактується як невалідні дані: викликач отримає 'invalid-data' і збереже резервну копію.
    return null;
  }
}

/** Доводить довільні дані до поточної версії схеми й валідує результат. Ніколи не кидає. */
export function migrateProgress(input: unknown, migrations: MigrationTable = PROGRESS_MIGRATIONS): MigrationOutcome {
  if (!isPlainObject(input)) return { ok: false, error: 'not-object' };

  const initialVersion = readVersion(input);
  if (initialVersion === null) return { ok: false, error: 'missing-version' };
  if (initialVersion > PROGRESS_SCHEMA_VERSION) return { ok: false, error: 'future-version' };

  let data: Record<string, unknown> = input;
  for (let version = initialVersion; version < PROGRESS_SCHEMA_VERSION; version += 1) {
    const migration = migrations[version];
    if (!migration) return { ok: false, error: 'missing-migration' };

    const next = applyMigration(migration, data);
    if (next === null || readVersion(next) !== version + 1) return { ok: false, error: 'invalid-data' };
    data = next;
  }

  const parsed = ProgressStateSchema.safeParse(data);
  if (!parsed.success) return { ok: false, error: 'invalid-data' };
  return { ok: true, state: parsed.data, migrated: initialVersion !== PROGRESS_SCHEMA_VERSION };
}
