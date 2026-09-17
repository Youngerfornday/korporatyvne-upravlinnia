import { describe, expect, it } from 'vitest';
import { LATER, MATRIX, NOW } from './__fixtures__/matrix';
import { checkFeature, finishMatrixAttempt, selectModel, type MatrixAttempt } from './attempt';
import { currentAttempt, matrixStage, replaceCurrentAttempt, startGradedAttempt, startMatrixSession } from './session';

function unwrap<T>(result: { ok: true; value: T } | { ok: false; error: { code: string } }): T {
  if (!result.ok) throw new Error(result.error.code);
  return result.value;
}

function completeLearning(attempt: MatrixAttempt): MatrixAttempt {
  const answered = attempt.groups.reduce(
    (current, group) => group.itemIds.reduce((inner, itemId) => unwrap(selectModel(inner, MATRIX, itemId, itemId.split(':')[1] ?? null)), current),
    attempt,
  );
  const checked = attempt.groups.reduce((current, group) => unwrap(checkFeature(current, MATRIX, group.featureId)), answered);
  return unwrap(finishMatrixAttempt(checked, MATRIX, LATER));
}

describe('сесія практичної: перша спроба навчальна, друга оцінювана', () => {
  it('починається з навчальної спроби', () => {
    const session = startMatrixSession({ matrix: MATRIX, seed: 'p01-1', now: NOW });
    expect(matrixStage(session)).toBe('learning');
    expect(session.learning.mode).toBe('learning');
    expect(session.graded).toBeNull();
    expect(currentAttempt(session)).toBe(session.learning);
  });

  it('оцінювану спробу не можна почати до завершення навчальної', () => {
    const session = startMatrixSession({ matrix: MATRIX, seed: 'p01-1', now: NOW });
    const result = startGradedAttempt(session, MATRIX, NOW);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('learning-unfinished');
      expect(result.error.message).toMatch(/навчальн/);
    }
  });

  it('після навчальної — оцінювана з іншим порядком; після її завершення — результат', () => {
    const started = startMatrixSession({ matrix: MATRIX, seed: 'p01-1', now: NOW });
    const learned = replaceCurrentAttempt(started, completeLearning(started.learning));
    expect(matrixStage(learned)).toBe('learning-done');

    const graded = unwrap(startGradedAttempt(learned, MATRIX, LATER));
    expect(matrixStage(graded)).toBe('graded');
    expect(graded.graded?.mode).toBe('graded');
    expect(graded.graded?.seed).not.toBe(graded.learning.seed);
    expect(currentAttempt(graded)).toBe(graded.graded);

    const again = startGradedAttempt(graded, MATRIX, LATER);
    expect(!again.ok && again.error.code).toBe('graded-started');

    const finishedGraded = unwrap(finishMatrixAttempt(graded.graded as MatrixAttempt, MATRIX, LATER));
    const done = replaceCurrentAttempt(graded, finishedGraded);
    expect(matrixStage(done)).toBe('result');
    expect(done.learning).toBe(graded.learning);
  });
});
