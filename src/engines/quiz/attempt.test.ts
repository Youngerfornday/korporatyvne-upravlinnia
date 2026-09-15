import { describe, expect, it } from 'vitest';
import { createSeededRandom } from '../shared/random';
import * as fx from './__fixtures__/questions';
import { answerQuestion, finishAttempt, startAttempt, type QuizAttempt } from './attempt';
import type { Question } from './types';

const T0 = new Date('2026-09-15T09:00:00.000Z');
const T1 = new Date('2026-09-15T09:05:00.000Z');
const T2 = new Date('2026-09-15T09:10:00.000Z');

function bank(): Question[] {
  return [fx.single(), fx.trueFalse(), fx.numerical(), { ...fx.multi(), defaultMark: 2 }];
}

function start(mode: 'immediate' | 'deferred' = 'immediate', seed = 'attempt'): QuizAttempt {
  return startAttempt({ quizId: 't04-training', questions: bank(), random: createSeededRandom(seed), now: T0, mode });
}

function slotOf(attempt: QuizAttempt, questionId: string): number {
  return attempt.slots.findIndex((slot) => slot.questionId === questionId);
}

function unwrap(result: ReturnType<typeof answerQuestion>): QuizAttempt {
  if (!result.ok) throw new Error(result.error.message);
  return result.value;
}

describe('startAttempt', () => {
  it('creates one slot per question with its mark and a seeded question order', () => {
    // Act
    const attempt = start();

    // Assert
    expect(attempt.status).toBe('in-progress');
    expect(attempt.startedAt).toBe(T0.toISOString());
    expect(attempt.slots.map((slot) => slot.questionId).sort()).toEqual(bank().map((q) => q.id).sort());
    expect(attempt.slots.find((slot) => slot.questionId === 't05-q002')?.maxMark).toBe(2);
    expect(start()).toEqual(attempt);
    const orders = new Set(['a', 'b', 'c', 'd', 'e'].map((seed) => start('immediate', seed).slots.map((s) => s.questionId).join()));
    expect(orders.size).toBeGreaterThan(1);
  });

  it('keeps the bank order when question shuffling is off', () => {
    const attempt = startAttempt({
      quizId: 'q',
      questions: bank(),
      random: createSeededRandom(1),
      now: T0,
      shuffleQuestions: false,
    });
    expect(attempt.slots.map((slot) => slot.questionId)).toEqual(bank().map((q) => q.id));
    expect(attempt.mode).toBe('immediate');
  });

  it('refuses an empty quiz and duplicate question IDs', () => {
    expect(() => startAttempt({ quizId: 'q', questions: [], random: createSeededRandom(1), now: T0 })).toThrow(RangeError);
    expect(() =>
      startAttempt({ quizId: 'q', questions: [fx.single(), fx.single()], random: createSeededRandom(1), now: T0 }),
    ).toThrow(/t04-q001/);
  });
});

describe('answerQuestion in immediate mode', () => {
  it('grades at once, returns a new attempt and leaves the old one untouched', () => {
    // Arrange
    const attempt = start();
    const slot = slotOf(attempt, 't04-q001');

    // Act
    const next = unwrap(answerQuestion(attempt, bank(), slot, { type: 'multichoice', selected: [0] }, T1));

    // Assert
    expect(next.slots[slot]).toMatchObject({
      response: { type: 'multichoice', selected: [0] },
      grade: { fraction: 1, state: 'right' },
      answeredAt: T1.toISOString(),
    });
    expect(attempt.slots[slot]?.response).toBeNull();
  });

  it('does not allow changing a submitted answer', () => {
    const attempt = start();
    const slot = slotOf(attempt, 't01-q003');
    const answered = unwrap(answerQuestion(attempt, bank(), slot, { type: 'truefalse', value: true }, T1));
    expect(answerQuestion(answered, bank(), slot, { type: 'truefalse', value: false }, T2)).toMatchObject({
      ok: false,
      error: { code: 'already-answered' },
    });
  });

  it('returns validation issues without recording the response', () => {
    const attempt = start();
    const slot = slotOf(attempt, 't07-q005');
    const result = answerQuestion(attempt, bank(), slot, { type: 'numerical', answer: 'тридцять' }, T1);
    expect(result).toMatchObject({ ok: false, error: { code: 'invalid-response', issue: { code: 'invalid-number' } } });
  });

  it('reports unknown slots and questions missing from the bank', () => {
    const attempt = start();
    expect(answerQuestion(attempt, bank(), 99, { type: 'truefalse', value: true }, T1)).toMatchObject({
      ok: false,
      error: { code: 'slot-not-found' },
    });
    expect(answerQuestion(attempt, [], 0, { type: 'truefalse', value: true }, T1)).toMatchObject({
      ok: false,
      error: { code: 'question-not-found' },
    });
  });
});

describe('answerQuestion in deferred mode and finishAttempt', () => {
  it('lets the student change answers and grades everything on finish', () => {
    // Arrange
    let attempt = start('deferred');
    const single = slotOf(attempt, 't04-q001');
    const numerical = slotOf(attempt, 't07-q005');

    // Act
    attempt = unwrap(answerQuestion(attempt, bank(), single, { type: 'multichoice', selected: [1] }, T1));
    expect(attempt.slots[single]?.grade).toBeNull();
    attempt = unwrap(answerQuestion(attempt, bank(), single, { type: 'multichoice', selected: [0] }, T1));
    attempt = unwrap(answerQuestion(attempt, bank(), numerical, { type: 'numerical', answer: '32,5' }, T1));
    const finished = finishAttempt(attempt, bank(), T2);

    // Assert
    expect(finished.status).toBe('finished');
    expect(finished.finishedAt).toBe(T2.toISOString());
    expect(finished.slots[single]?.grade).toEqual({ fraction: 1, state: 'right' });
    expect(finished.slots[slotOf(finished, 't01-q003')]?.grade).toEqual({ fraction: 0, state: 'gaveup' });
  });

  it('refuses answers after finishing and keeps finishing idempotent', () => {
    const finished = finishAttempt(start(), bank(), T1);
    expect(finishAttempt(finished, bank(), T2)).toBe(finished);
    expect(answerQuestion(finished, bank(), 0, { type: 'truefalse', value: true }, T2)).toMatchObject({
      ok: false,
      error: { code: 'attempt-finished' },
    });
  });

  it('grades a slot whose question disappeared from the bank as gave up', () => {
    const finished = finishAttempt(start('deferred'), [], T1);
    expect(finished.slots.every((slot) => slot.grade?.state === 'gaveup')).toBe(true);
  });
});
