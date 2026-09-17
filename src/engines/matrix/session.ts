import { err, ok, type Result } from '../shared/result';
import { startMatrixAttempt } from './attempt';
import { MATRIX_ERROR_MESSAGES } from './texts';
import type { MatrixAttempt, MatrixDefinition, MatrixError } from './types';

/**
 * Сесія практичної: перша спроба навчальна, друга — оцінювана за рубрикою. Оцінювану спробу можна почати
 * лише після завершення навчальної, і лише один раз за сесію; вона перемішується іншим зерном.
 */
export interface MatrixSession {
  readonly seed: string;
  readonly learning: MatrixAttempt;
  readonly graded: MatrixAttempt | null;
}

/** learning → learning-done (навчальну завершено) → graded → result. */
export type MatrixStage = 'learning' | 'learning-done' | 'graded' | 'result';

export function startMatrixSession({ matrix, seed, now }: { readonly matrix: MatrixDefinition; readonly seed: string; readonly now: Date }): MatrixSession {
  return { seed, learning: startMatrixAttempt({ matrix, mode: 'learning', seed: `${seed}:learning`, now }), graded: null };
}

export function matrixStage(session: MatrixSession): MatrixStage {
  if (session.graded) return session.graded.status === 'finished' ? 'result' : 'graded';
  return session.learning.status === 'finished' ? 'learning-done' : 'learning';
}

export function currentAttempt(session: MatrixSession): MatrixAttempt {
  return session.graded ?? session.learning;
}

/** Замінити поточну спробу її новою версією (після selectModel, checkFeature, finishMatrixAttempt). */
export function replaceCurrentAttempt(session: MatrixSession, attempt: MatrixAttempt): MatrixSession {
  return session.graded ? { ...session, graded: attempt } : { ...session, learning: attempt };
}

export function startGradedAttempt(session: MatrixSession, matrix: MatrixDefinition, now: Date): Result<MatrixSession, MatrixError> {
  if (session.graded) return err({ code: 'graded-started', message: MATRIX_ERROR_MESSAGES['graded-started'] });
  if (session.learning.status !== 'finished') return err({ code: 'learning-unfinished', message: MATRIX_ERROR_MESSAGES['learning-unfinished'] });
  return ok({ ...session, graded: startMatrixAttempt({ matrix, mode: 'graded', seed: `${session.seed}:graded`, now }) });
}
