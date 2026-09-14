import { ProgressStateSchema, type ProgressState } from './state';

export type PreparedSave =
  | { readonly ok: true; readonly state: ProgressState; readonly serialized: string }
  | { readonly ok: false; readonly reason: 'invalid-state' | 'too-large' };

/** Спільний для всіх сховищ крок перед записом: валідація, штамп часу, контроль розміру. */
export function prepareForSave(state: ProgressState, now: Date, maxLength: number): PreparedSave {
  const parsed = ProgressStateSchema.safeParse({ ...state, updatedAt: now.toISOString() });
  if (!parsed.success) return { ok: false, reason: 'invalid-state' };

  const serialized = JSON.stringify(parsed.data);
  if (serialized.length > maxLength) return { ok: false, reason: 'too-large' };
  return { ok: true, state: parsed.data, serialized };
}
