import { describe, expect, it } from 'vitest';
import { applyLearningEvent } from '../gamification';
import { createEmptyProgress } from '../progress';
import { LATER, MATRIX, NOW } from './__fixtures__/matrix';
import { finishMatrixAttempt, selectModel, startMatrixAttempt, summarizeMatrixAttempt, type MatrixAttempt } from './attempt';
import { matrixActivityId, matrixCompletedEvent } from './events';

function finishedGraded(correctItems: number): MatrixAttempt {
  const attempt = startMatrixAttempt({ matrix: MATRIX, mode: 'graded', seed: 'ev', now: NOW });
  const itemIds = attempt.groups.flatMap((group) => group.itemIds).slice(0, correctItems);
  const answered = itemIds.reduce((current, itemId) => {
    const result = selectModel(current, MATRIX, itemId, itemId.split(':')[1] ?? null);
    if (!result.ok) throw new Error(result.error.code);
    return result.value;
  }, attempt);
  const finished = finishMatrixAttempt(answered, MATRIX, LATER);
  if (!finished.ok) throw new Error(finished.error.code);
  return finished.value;
}

describe('matrixCompletedEvent', () => {
  it('будує подію trainer-completed для завершеної оцінюваної спроби з результатом-часткою', () => {
    const attempt = finishedGraded(9);
    const event = matrixCompletedEvent(attempt, summarizeMatrixAttempt(attempt, MATRIX), 'p01');

    expect(event).toEqual({ id: `trainer:p01-model-matrix:${NOW.getTime()}`, type: 'trainer-completed', activityId: 'p01-model-matrix', score: 1 });
  });

  it('повертає null для навчальної чи незавершеної спроби', () => {
    const learning = startMatrixAttempt({ matrix: MATRIX, mode: 'learning', seed: 'ev', now: NOW });
    const finished = finishedGraded(3);
    expect(matrixCompletedEvent(learning, summarizeMatrixAttempt(finished, MATRIX), 'p01')).toBeNull();

    const running = startMatrixAttempt({ matrix: MATRIX, mode: 'graded', seed: 'ev', now: NOW });
    expect(matrixCompletedEvent(running, summarizeMatrixAttempt(finished, MATRIX), 'p01')).toBeNull();
  });

  it('подія ідемпотентна через рушій геймифікації: 60 × частку XP, повтор ігнорується', () => {
    const attempt = finishedGraded(6);
    const event = matrixCompletedEvent(attempt, summarizeMatrixAttempt(attempt, MATRIX), 'p01');
    if (!event) throw new Error('подію не побудовано');

    const first = applyLearningEvent(createEmptyProgress(NOW), event, LATER);
    if (!first.ok) throw new Error(first.error.message);
    expect(first.value.xpGained).toBe(40);
    expect(first.value.state.activities['p01-model-matrix']).toMatchObject({ attempts: 1 });

    const second = applyLearningEvent(first.value.state, event, LATER);
    expect(second.ok && second.value.duplicate).toBe(true);
    expect(second.ok && second.value.state.xp).toBe(40);
  });

  it('ID активності практичної — стабільний і валідний', () => {
    expect(matrixActivityId('p01')).toBe('p01-model-matrix');
    expect(() => matrixActivityId('P 01')).toThrow();
  });
});
