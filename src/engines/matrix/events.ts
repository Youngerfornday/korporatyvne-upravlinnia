import type { LearningEvent } from '../gamification';
import type { MatrixAttempt, MatrixSummary } from './types';

/**
 * Подія геймифікації за оцінювану спробу матриці: `trainer-completed` з часткою правильних.
 * ID події прив’язаний до початку спроби, тому повторне застосування тієї самої спроби рушій
 * геймифікації ігнорує; XP — 60 × найкраща частка, повтор дає лише приріст.
 */
const PRACTICAL_ID = /^p\d{2}$/;

export function matrixActivityId(practicalId: string): string {
  if (!PRACTICAL_ID.test(practicalId)) throw new Error(`Некоректний ID практичної «${practicalId}»`);
  return `${practicalId}-model-matrix`;
}

export function matrixCompletedEvent(attempt: MatrixAttempt, summary: Pick<MatrixSummary, 'share'>, practicalId: string): LearningEvent | null {
  if (attempt.mode !== 'graded' || attempt.status !== 'finished') return null;
  const activityId = matrixActivityId(practicalId);
  return { id: `trainer:${activityId}:${Date.parse(attempt.startedAt)}`, type: 'trainer-completed', activityId, score: summary.share };
}
