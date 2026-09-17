import { describe, expect, it } from 'vitest';
import { LATER, MATRIX, NOW } from './__fixtures__/matrix';
import {
  attemptProgress,
  checkFeature,
  finishMatrixAttempt,
  itemIdOf,
  reviewItem,
  selectModel,
  startMatrixAttempt,
  summarizeMatrixAttempt,
  type MatrixAttempt,
} from './attempt';

function unwrap<T>(result: { ok: true; value: T } | { ok: false; error: { code: string } }): T {
  if (!result.ok) throw new Error(`Очікувався успіх, отримано ${result.error.code}`);
  return result.value;
}

/** Відповідає на всі формулювання ознаки: правильно або зсунутою на одну модель (завжди хибно). */
function answerFeature(attempt: MatrixAttempt, featureId: string, correct: boolean): MatrixAttempt {
  const group = attempt.groups.find((candidate) => candidate.featureId === featureId);
  if (!group) throw new Error(featureId);
  const modelIds = MATRIX.models.map((model) => model.id);
  return group.itemIds.reduce((current, itemId) => {
    const right = itemId.split(':')[1] ?? '';
    const wrong = modelIds[(modelIds.indexOf(right) + 1) % modelIds.length] ?? '';
    return unwrap(selectModel(current, MATRIX, itemId, correct ? right : wrong));
  }, attempt);
}

function answerAll(attempt: MatrixAttempt, correctFeatures: readonly string[]): MatrixAttempt {
  return MATRIX.features.reduce((current, feature) => answerFeature(current, feature.id, correctFeatures.includes(feature.id)), attempt);
}

describe('startMatrixAttempt', () => {
  it('створює групу на кожну ознаку з усіма клітинками, без відповідей', () => {
    // Arrange / Act
    const attempt = startMatrixAttempt({ matrix: MATRIX, mode: 'learning', seed: 'p01:1', now: NOW });

    // Assert
    expect(attempt.status).toBe('running');
    expect(attempt.mode).toBe('learning');
    expect(attempt.startedAt).toBe(NOW.toISOString());
    expect(attempt.groups.map((group) => group.featureId).sort()).toEqual(['board', 'employees', 'ownership']);
    for (const group of attempt.groups) {
      expect(group.itemIds.map((id) => id.split(':')[1]).sort()).toEqual(['family', 'insider', 'outsider']);
    }
    expect(attempt.responses).toEqual({});
  });

  it('перемішує відтворювано: однакове зерно — однаковий порядок, інше — інший', () => {
    const order = (seed: string) => startMatrixAttempt({ matrix: MATRIX, mode: 'graded', seed, now: NOW }).groups.flatMap((group) => group.itemIds);
    expect(order('same')).toEqual(order('same'));
    const orders = new Set(['a', 'b', 'c', 'd', 'e', 'f'].map((seed) => order(seed).join('|')));
    expect(orders.size).toBeGreaterThan(1);
  });

  it('не змінює вхідну матрицю', () => {
    const snapshot = JSON.stringify(MATRIX);
    startMatrixAttempt({ matrix: MATRIX, mode: 'learning', seed: 'x', now: NOW });
    expect(JSON.stringify(MATRIX)).toBe(snapshot);
  });

  it('кидає помилку програміста на некоректній матриці', () => {
    expect(() => startMatrixAttempt({ matrix: { models: [], features: [] }, mode: 'learning', seed: 'x', now: NOW })).toThrow(/модел/);
    const unknownModel = { ...MATRIX, features: [{ id: 'f', title: 'Ф', cells: [{ model: 'nope', statement: 'S', explanation: 'E', source: 's' }] }] };
    expect(() => startMatrixAttempt({ matrix: unknownModel, mode: 'learning', seed: 'x', now: NOW })).toThrow(/nope/);
    const duplicateFeature = { ...MATRIX, features: [MATRIX.features[0]!, MATRIX.features[0]!] };
    expect(() => startMatrixAttempt({ matrix: duplicateFeature, mode: 'learning', seed: 'x', now: NOW })).toThrow(/ownership/);
    const duplicateCell = { ...MATRIX, features: [{ id: 'f', title: 'Ф', cells: [MATRIX.features[0]!.cells[0]!, MATRIX.features[0]!.cells[0]!] }] };
    expect(() => startMatrixAttempt({ matrix: duplicateCell, mode: 'learning', seed: 'x', now: NOW })).toThrow(/outsider/);
  });
});

describe('selectModel', () => {
  const start = () => startMatrixAttempt({ matrix: MATRIX, mode: 'graded', seed: 'sel', now: NOW });

  it('записує вибір у нову спробу, не змінюючи попередню; null знімає вибір', () => {
    const attempt = start();
    const itemId = itemIdOf('ownership', 'insider');

    const selected = unwrap(selectModel(attempt, MATRIX, itemId, 'family'));
    expect(selected.responses[itemId]).toBe('family');
    expect(attempt.responses[itemId]).toBeUndefined();

    const cleared = unwrap(selectModel(selected, MATRIX, itemId, null));
    expect(Object.hasOwn(cleared.responses, itemId)).toBe(false);
  });

  it('повертає помилки для невідомого формулювання й моделі', () => {
    const attempt = start();
    const unknownItem = selectModel(attempt, MATRIX, 'nope:outsider', 'outsider');
    expect(unknownItem.ok).toBe(false);
    if (!unknownItem.ok) expect(unknownItem.error.code).toBe('unknown-item');

    const unknownModel = selectModel(attempt, MATRIX, itemIdOf('board', 'family'), 'ghost');
    expect(unknownModel.ok).toBe(false);
    if (!unknownModel.ok) expect(unknownModel.error.code).toBe('unknown-model');

    const prototypeKey = selectModel(attempt, MATRIX, '__proto__', 'outsider');
    expect(prototypeKey.ok).toBe(false);
  });

  it('у навчальній спробі перевірену ознаку змінити не можна', () => {
    const learning = answerFeature(startMatrixAttempt({ matrix: MATRIX, mode: 'learning', seed: 'l', now: NOW }), 'board', true);
    const checked = unwrap(checkFeature(learning, MATRIX, 'board'));

    const result = selectModel(checked, MATRIX, itemIdOf('board', 'family'), 'insider');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('locked');
  });

  it('після завершення спроби відповіді не змінюються', () => {
    const finished = unwrap(finishMatrixAttempt(start(), MATRIX, LATER));
    const result = selectModel(finished, MATRIX, itemIdOf('board', 'family'), 'family');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('finished');
  });
});

describe('checkFeature (навчальна спроба)', () => {
  it('вимагає відповіді на всі формулювання ознаки', () => {
    const attempt = startMatrixAttempt({ matrix: MATRIX, mode: 'learning', seed: 'c', now: NOW });
    const partial = unwrap(selectModel(attempt, MATRIX, itemIdOf('ownership', 'outsider'), 'outsider'));

    const result = checkFeature(partial, MATRIX, 'ownership');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('incomplete');
      expect(result.error.message).toMatch(/усі/);
    }
  });

  it('фіксує ознаку і відкриває розбір кожної клітинки', () => {
    const attempt = answerFeature(startMatrixAttempt({ matrix: MATRIX, mode: 'learning', seed: 'c', now: NOW }), 'ownership', false);
    const hiddenBefore = reviewItem(attempt, MATRIX, itemIdOf('ownership', 'insider'));
    expect(hiddenBefore.revealed).toBe(false);
    expect(hiddenBefore.state).toBe('answered');
    expect(hiddenBefore.correctModel).toBeUndefined();
    expect(hiddenBefore.explanation).toBeUndefined();

    const checked = unwrap(checkFeature(attempt, MATRIX, 'ownership'));
    expect(checked.checkedFeatures).toEqual(['ownership']);
    const review = reviewItem(checked, MATRIX, itemIdOf('ownership', 'insider'));
    expect(review).toMatchObject({
      revealed: true,
      state: 'wrong',
      chosenModel: 'family',
      correctModel: 'insider',
      featureTitle: 'Структура власності',
      statement: 'Концентрована',
      explanation: 'Пояснення: Концентрована',
      sources: ['src-b', 'src-a'],
    });
  });

  it('не працює в оцінюваній спробі, для невідомої чи вже перевіреної ознаки', () => {
    const graded = answerFeature(startMatrixAttempt({ matrix: MATRIX, mode: 'graded', seed: 'g', now: NOW }), 'board', true);
    const inGraded = checkFeature(graded, MATRIX, 'board');
    expect(!inGraded.ok && inGraded.error.code).toBe('not-learning');

    const learning = answerFeature(startMatrixAttempt({ matrix: MATRIX, mode: 'learning', seed: 'l', now: NOW }), 'board', true);
    const unknown = checkFeature(learning, MATRIX, 'ghost');
    expect(!unknown.ok && unknown.error.code).toBe('unknown-feature');

    const twice = checkFeature(unwrap(checkFeature(learning, MATRIX, 'board')), MATRIX, 'board');
    expect(!twice.ok && twice.error.code).toBe('already-checked');
  });

  it('після завершення перевіряти ознаку не можна', () => {
    const all = answerAll(startMatrixAttempt({ matrix: MATRIX, mode: 'learning', seed: 'l', now: NOW }), ['board', 'ownership', 'employees']);
    const checked = MATRIX.features.reduce((current, feature) => unwrap(checkFeature(current, MATRIX, feature.id)), all);
    const finished = unwrap(finishMatrixAttempt(checked, MATRIX, LATER));
    const result = checkFeature(finished, MATRIX, 'board');
    expect(!result.ok && result.error.code).toBe('finished');
  });
});

describe('finishMatrixAttempt і summarizeMatrixAttempt', () => {
  it('навчальну спробу можна завершити лише після перевірки всіх ознак', () => {
    const all = answerAll(startMatrixAttempt({ matrix: MATRIX, mode: 'learning', seed: 'f', now: NOW }), ['ownership', 'board']);
    const early = finishMatrixAttempt(all, MATRIX, LATER);
    expect(!early.ok && early.error.code).toBe('incomplete');

    const checked = MATRIX.features.reduce((current, feature) => unwrap(checkFeature(current, MATRIX, feature.id)), all);
    const finished = unwrap(finishMatrixAttempt(checked, MATRIX, LATER));
    expect(finished.status).toBe('finished');
    expect(finished.finishedAt).toBe(LATER.toISOString());
    expect(summarizeMatrixAttempt(finished, MATRIX)).toMatchObject({ total: 9, right: 6, wrong: 3, unanswered: 0 });

    const again = finishMatrixAttempt(finished, MATRIX, LATER);
    expect(!again.ok && again.error.code).toBe('finished');
  });

  it('оцінювану спробу можна завершити з пропусками: вони рахуються як неправильні', () => {
    const attempt = answerFeature(startMatrixAttempt({ matrix: MATRIX, mode: 'graded', seed: 'g', now: NOW }), 'employees', true);
    const withOneWrong = unwrap(selectModel(attempt, MATRIX, itemIdOf('board', 'outsider'), 'family'));
    const finished = unwrap(finishMatrixAttempt(withOneWrong, MATRIX, LATER));

    const summary = summarizeMatrixAttempt(finished, MATRIX);
    expect(summary).toMatchObject({ total: 9, answered: 4, right: 3, wrong: 1, unanswered: 5 });
    expect(summary.share).toBeCloseTo(3 / 9);
    expect(summary.features).toEqual([
      { featureId: 'ownership', right: 0, total: 3 },
      { featureId: 'board', right: 0, total: 3 },
      { featureId: 'employees', right: 3, total: 3 },
    ]);
    expect(summary.models.find((model) => model.modelId === 'insider')).toEqual({ modelId: 'insider', right: 1, total: 3 });

    const unanswered = reviewItem(finished, MATRIX, itemIdOf('ownership', 'family'));
    expect(unanswered).toMatchObject({ revealed: true, state: 'unanswered', chosenModel: null, correctModel: 'family' });
  });

  it('оцінювана спроба до завершення нічого не розкриває', () => {
    const attempt = answerFeature(startMatrixAttempt({ matrix: MATRIX, mode: 'graded', seed: 'g', now: NOW }), 'board', true);
    const review = reviewItem(attempt, MATRIX, itemIdOf('board', 'family'));
    expect(review.revealed).toBe(false);
    expect(review.correctModel).toBeUndefined();
    expect(() => summarizeMatrixAttempt(attempt, MATRIX)).toThrow(/заверш/);
  });

  it('reviewItem кидає помилку програміста для невідомого формулювання', () => {
    const attempt = startMatrixAttempt({ matrix: MATRIX, mode: 'graded', seed: 'g', now: NOW });
    expect(() => reviewItem(attempt, MATRIX, 'ghost:outsider')).toThrow(/ghost/);
  });
});

describe('attemptProgress', () => {
  it('рахує відповіді й лише розкриті правильні, не підглядаючи в оцінювану спробу', () => {
    const graded = answerAll(startMatrixAttempt({ matrix: MATRIX, mode: 'graded', seed: 'p', now: NOW }), ['ownership', 'board', 'employees']);
    expect(attemptProgress(graded, MATRIX)).toEqual({ total: 9, answered: 9, revealed: 0, revealedRight: 0, checkedFeatures: 0, features: 3 });

    const learning = answerAll(startMatrixAttempt({ matrix: MATRIX, mode: 'learning', seed: 'p', now: NOW }), ['ownership']);
    const checked = unwrap(checkFeature(unwrap(checkFeature(learning, MATRIX, 'ownership')), MATRIX, 'board'));
    expect(attemptProgress(checked, MATRIX)).toEqual({ total: 9, answered: 9, revealed: 6, revealedRight: 3, checkedFeatures: 2, features: 3 });
  });
});
