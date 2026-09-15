import { describe, expect, it } from 'vitest';
import { FIXED_NOW, LATER_NOW } from '../progress/__fixtures__/sample-state';
import { PROGRESS_LIMITS, ProgressStateSchema, createEmptyProgress, type ProgressState } from '../progress/state';
import { applyLearningEvent, type EventOutcome } from './apply-event';
import type { LearningEvent } from './xp-rules';

function apply(state: ProgressState, event: LearningEvent, now = LATER_NOW): EventOutcome {
  const result = applyLearningEvent(state, event, now);
  if (!result.ok) throw new Error(result.error.message);
  return result.value;
}

function applyAll(events: readonly LearningEvent[]): EventOutcome {
  let outcome = apply(createEmptyProgress(FIXED_NOW), events[0] as LearningEvent);
  for (const event of events.slice(1)) outcome = apply(outcome.state, event);
  return outcome;
}

describe('applyLearningEvent: XP', () => {
  it('awards XP, marks the topic completed and stamps the state', () => {
    // Arrange
    const state = createEmptyProgress(FIXED_NOW);

    // Act
    const outcome = apply(state, { id: 'topic-read:t01', type: 'topic-read', topicId: 't01' });

    // Assert
    expect(outcome.xpGained).toBe(100);
    expect(outcome.duplicate).toBe(false);
    expect(outcome.state.xp).toBe(100);
    expect(outcome.state.xpLedger).toEqual({ 'topic-read:t01': 100 });
    expect(outcome.state.topics['t01']).toEqual({ status: 'completed', updatedAt: LATER_NOW.toISOString() });
    expect(outcome.state.updatedAt).toBe(LATER_NOW.toISOString());
    expect(outcome.state.recentEventIds).toEqual(['topic-read:t01']);
    expect(ProgressStateSchema.safeParse(outcome.state).success).toBe(true);
    expect(state).toEqual(createEmptyProgress(FIXED_NOW));
  });

  it('is idempotent by event ID', () => {
    const first = apply(createEmptyProgress(FIXED_NOW), { id: 'quiz:t01:1', type: 'quiz-finished', quizId: 't01', score: 0.6 });
    const again = apply(first.state, { id: 'quiz:t01:1', type: 'quiz-finished', quizId: 't01', score: 0.6 });
    expect(again).toMatchObject({ duplicate: true, xpGained: 0, newBadges: [] });
    expect(again.state).toBe(first.state);
  });

  it('awards only the improvement over the best previous quiz result, so repeats do not farm XP', () => {
    // Act
    const outcome = applyAll([
      { id: 'q-1', type: 'quiz-finished', quizId: 't01', score: 0.6 },
      { id: 'q-2', type: 'quiz-finished', quizId: 't01', score: 0.6 },
      { id: 'q-3', type: 'quiz-finished', quizId: 't01', score: 0.4 },
      { id: 'q-4', type: 'quiz-finished', quizId: 't01', score: 0.9 },
    ]);

    // Assert
    expect(outcome.xpGained).toBe(45);
    expect(outcome.state.xp).toBe(135);
    expect(outcome.state.xpLedger).toEqual({ 'quiz:t01': 135 });
    expect(outcome.state.quizzes['t01']).toEqual({ attempts: 4, bestScore: 0.9, lastAttemptAt: LATER_NOW.toISOString() });
  });

  it('does not re-award a topic read through a different event ID', () => {
    const outcome = applyAll([
      { id: 'a', type: 'topic-read', topicId: 't02' },
      { id: 'b', type: 'topic-read', topicId: 't02' },
    ]);
    expect(outcome.xpGained).toBe(0);
    expect(outcome.state.xp).toBe(100);
  });

  it('records trainer attempts, best score and flawless variants', () => {
    const outcome = applyAll([
      { id: 'a', type: 'trainer-completed', activityId: 'quorum-calculator', score: 0.5, variantId: 'v1' },
      { id: 'b', type: 'trainer-completed', activityId: 'quorum-calculator', score: 1, variantId: 'v2' },
      { id: 'c', type: 'trainer-completed', activityId: 'quorum-calculator', score: 1, variantId: 'v2' },
      { id: 'd', type: 'trainer-completed', activityId: 'quorum-calculator', score: 0.2 },
    ]);
    expect(outcome.state.activities['quorum-calculator']).toEqual({
      attempts: 4,
      bestScore: 1,
      completedAt: LATER_NOW.toISOString(),
      solvedVariants: ['v2'],
    });
    expect(outcome.state.xp).toBe(60);
  });

  it('stores cases as activities and gives flashcard XP proportionally', () => {
    const outcome = applyAll([
      { id: 'a', type: 'case-completed', caseId: 'mriia-case', score: 0.75 },
      { id: 'b', type: 'flashcards-reviewed', deckId: 't03', mastered: 12, total: 12 },
      { id: 'c', type: 'self-check-passed', topicId: 't03' },
    ]);
    expect(outcome.state.activities['mriia-case']).toMatchObject({ attempts: 1, bestScore: 0.75 });
    expect(outcome.state.xp).toBe(60 + 30 + 20);
  });

  it('caps XP at the schema limit', () => {
    const rich = { ...createEmptyProgress(FIXED_NOW), xp: PROGRESS_LIMITS.xp - 10 };
    expect(apply(rich, { id: 'x', type: 'topic-read', topicId: 't05' }).state.xp).toBe(PROGRESS_LIMITS.xp);
  });

  it('keeps only the most recent event IDs', () => {
    const ids = Array.from({ length: PROGRESS_LIMITS.recentEvents }, (_, index) => `old-${index}`);
    const state = { ...createEmptyProgress(FIXED_NOW), recentEventIds: ids };
    const outcome = apply(state, { id: 'new', type: 'self-check-passed', topicId: 't01' });
    expect(outcome.state.recentEventIds).toHaveLength(PROGRESS_LIMITS.recentEvents);
    expect(outcome.state.recentEventIds.at(-1)).toBe('new');
    expect(outcome.state.recentEventIds[0]).toBe('old-1');
  });
});

describe('applyLearningEvent: levels and badges', () => {
  it('reports a level-up and newly earned badges with their award date', () => {
    // Arrange
    const state = { ...createEmptyProgress(FIXED_NOW), xp: 480 };

    // Act
    const outcome = apply(state, { id: 'cum', type: 'trainer-completed', activityId: 'cumulative-voting-calculator', score: 1 });

    // Assert
    expect(outcome.levelBefore.title).toBe('Акціонер');
    expect(outcome.levelAfter.title).toBe('Міноритарій');
    expect(outcome.leveledUp).toBe(true);
    expect(outcome.newBadges).toEqual(['kumuliatyvnyi-holos']);
    expect(outcome.state.badges).toEqual({ 'kumuliatyvnyi-holos': { awardedAt: LATER_NOW.toISOString() } });
  });

  it('never re-awards or re-dates a badge that is already held', () => {
    const first = apply(createEmptyProgress(FIXED_NOW), { id: 'a', type: 'trainer-completed', activityId: 'three-lines', score: 1 }, FIXED_NOW);
    const second = apply(first.state, { id: 'b', type: 'trainer-completed', activityId: 'three-lines', score: 1 });
    expect(second.newBadges).toEqual([]);
    expect(second.state.badges['try-linii']).toEqual({ awardedAt: FIXED_NOW.toISOString() });
    expect(second.leveledUp).toBe(false);
  });
});

describe('applyLearningEvent: errors', () => {
  it('rejects an invalid event without touching the state', () => {
    const result = applyLearningEvent(createEmptyProgress(FIXED_NOW), { id: 'x', type: 'quiz-finished', quizId: 'q', score: 2 }, LATER_NOW);
    expect(result).toMatchObject({ ok: false, error: { code: 'invalid-event' } });
  });

  it('refuses to grow a record beyond the progress limits', () => {
    const topics = Object.fromEntries(
      Array.from({ length: PROGRESS_LIMITS.topics }, (_, index) => [`topic-${index}`, { status: 'completed' as const, updatedAt: FIXED_NOW.toISOString() }]),
    );
    const state = { ...createEmptyProgress(FIXED_NOW), topics };
    const result = applyLearningEvent(state, { id: 'x', type: 'topic-read', topicId: 'one-more' }, LATER_NOW);
    expect(result).toMatchObject({ ok: false, error: { code: 'limit-exceeded' } });
    if (!result.ok) expect(result.error.message).toMatch(/[а-яіїєґ]/i);
  });
});
