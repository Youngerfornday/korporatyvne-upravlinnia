import { describe, expect, it } from 'vitest';
import { V2_LEDGER_RULES } from '../progress/migrate-v1-to-v2';
import { XP_RULES, awardForEvent, validateLearningEvent } from './xp-rules';

describe('XP_RULES', () => {
  it('matches the rules frozen in the v1 → v2 progress migration', () => {
    expect(XP_RULES.topicRead).toBe(V2_LEDGER_RULES.topicRead);
    expect(XP_RULES.quizMax).toBe(V2_LEDGER_RULES.quizMax);
    expect(XP_RULES.trainerMax).toBe(V2_LEDGER_RULES.trainerMax);
  });

  it('makes the top level reachable only with most of the course done', () => {
    // 12 тем, 12 самоперевірок, 12 тестів, 12 колод, 8 тренажерів практичних, 4 кейси.
    const capacity =
      12 * (XP_RULES.topicRead + XP_RULES.selfCheck + XP_RULES.quizMax + XP_RULES.flashcardDeck) +
      8 * XP_RULES.trainerMax +
      4 * XP_RULES.caseMax;
    expect(capacity).toBeGreaterThan(3400);
    expect(3400 / capacity).toBeGreaterThan(0.7);
  });
});

describe('awardForEvent', () => {
  it.each([
    [{ id: 'e1', type: 'topic-read', topicId: 't01' }, 'topic-read:t01', 100],
    [{ id: 'e2', type: 'self-check-passed', topicId: 't01' }, 'self-check:t01', 20],
    [{ id: 'e3', type: 'quiz-finished', quizId: 't01-training', score: 0.8667 }, 'quiz:t01-training', 130],
    [{ id: 'e4', type: 'flashcards-reviewed', deckId: 't01', mastered: 9, total: 12 }, 'flashcards:t01', 23],
    [{ id: 'e5', type: 'case-completed', caseId: 'board-decision-game', score: 0.5 }, 'case:board-decision-game', 40],
    [{ id: 'e6', type: 'trainer-completed', activityId: 'quorum-calculator', score: 1 }, 'trainer:quorum-calculator', 60],
  ] as const)('%o → %s = %i XP', (event, key, amount) => {
    expect(awardForEvent(event)).toEqual({ key, amount });
  });
});

describe('validateLearningEvent', () => {
  it('accepts a valid event', () => {
    expect(validateLearningEvent({ id: 'quiz:t01:1', type: 'quiz-finished', quizId: 't01-training', score: 1 })).toBeNull();
  });

  it.each([
    [{ id: 'Bad ID', type: 'topic-read', topicId: 't01' }],
    [{ id: 'e', type: 'topic-read', topicId: '__proto__' }],
    [{ id: 'e', type: 'quiz-finished', quizId: 'q', score: 1.2 }],
    [{ id: 'e', type: 'quiz-finished', quizId: 'q', score: Number.NaN }],
    [{ id: 'e', type: 'flashcards-reviewed', deckId: 'd', mastered: 5, total: 0 }],
    [{ id: 'e', type: 'flashcards-reviewed', deckId: 'd', mastered: 6, total: 5 }],
    [{ id: 'e', type: 'trainer-completed', activityId: 'a', score: 1, variantId: 'Варіант' }],
  ] as const)('rejects %o with a Ukrainian message', (event) => {
    expect(validateLearningEvent(event)).toMatch(/[а-яіїєґ]/i);
  });
});
