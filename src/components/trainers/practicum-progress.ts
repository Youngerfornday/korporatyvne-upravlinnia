/** Стан практикуму для карти проходження й списків: скільки опублікованих тренажерів уже зараховано. */
import type { ProgressState } from '../../engines/progress';

export type PracticumVisual = 'done' | 'doing' | 'todo';

export interface PracticumProgress {
  readonly state: PracticumVisual;
  readonly done: number;
  readonly total: number;
}

/** null — у теми немає опублікованих тренажерів. Тренажер зараховано, якщо в прогресі є його запис. */
export function practicumProgress(state: ProgressState, activityIds: readonly string[]): PracticumProgress | null {
  if (activityIds.length === 0) return null;
  const done = activityIds.filter((id) => Object.hasOwn(state.activities, id)).length;
  const visual: PracticumVisual = done === activityIds.length ? 'done' : done > 0 ? 'doing' : 'todo';
  return { state: visual, done, total: activityIds.length };
}

/** Підпис біля знака: «1 із 2»; для одного тренажера — порожньо (знак уже каже все). */
export function practicumNote(progress: PracticumProgress): string | undefined {
  return progress.total > 1 ? `${progress.done} із ${progress.total}` : undefined;
}
