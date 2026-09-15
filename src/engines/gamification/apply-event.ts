import { PROGRESS_LIMITS, ProgressStateSchema, type ActivityProgress, type ProgressState } from '../progress/state';
import { err, ok, type Result } from '../shared/result';
import { earnedBadgeIds } from './badges';
import { levelForXp, type Level } from './levels';
import { awardForEvent, validateLearningEvent, type LearningEvent } from './xp-rules';

export interface EventOutcome {
  readonly state: ProgressState;
  /** Подію з таким ID уже оброблено — стан повернуто без змін. */
  readonly duplicate: boolean;
  readonly xpGained: number;
  readonly newBadges: readonly string[];
  readonly levelBefore: Level;
  readonly levelAfter: Level;
  readonly leveledUp: boolean;
}

export type GamificationErrorCode = 'invalid-event' | 'limit-exceeded';

export interface GamificationError {
  readonly code: GamificationErrorCode;
  readonly message: string;
}

const FLAWLESS = 0.999999;

function nextActivity(previous: ActivityProgress | undefined, score: number, variantId: string | undefined, now: string): ActivityProgress {
  const variants = previous?.solvedVariants ?? [];
  const addVariant =
    variantId !== undefined && score > FLAWLESS && !variants.includes(variantId) && variants.length < PROGRESS_LIMITS.solvedVariants;
  const solvedVariants = addVariant ? [...variants, variantId] : previous?.solvedVariants;
  return {
    attempts: Math.min((previous?.attempts ?? 0) + 1, PROGRESS_LIMITS.attempts),
    bestScore: Math.max(previous?.bestScore ?? 0, score),
    completedAt: previous?.completedAt ?? now,
    ...(solvedVariants ? { solvedVariants } : {}),
  };
}

/** Зміни в записах прогресу, які супроводжують подію (крім XP і бейджів). */
function withRecords(state: ProgressState, event: LearningEvent, now: string): ProgressState {
  switch (event.type) {
    case 'topic-read':
      return { ...state, topics: { ...state.topics, [event.topicId]: { status: 'completed', updatedAt: now } } };
    case 'quiz-finished': {
      const previous = state.quizzes[event.quizId];
      const quiz = {
        attempts: Math.min((previous?.attempts ?? 0) + 1, PROGRESS_LIMITS.attempts),
        bestScore: Math.max(previous?.bestScore ?? 0, event.score),
        lastAttemptAt: now,
      };
      return { ...state, quizzes: { ...state.quizzes, [event.quizId]: quiz } };
    }
    case 'case-completed':
      return { ...state, activities: { ...state.activities, [event.caseId]: nextActivity(state.activities[event.caseId], event.score, undefined, now) } };
    case 'trainer-completed': {
      const activity = nextActivity(state.activities[event.activityId], event.score, event.variantId, now);
      return { ...state, activities: { ...state.activities, [event.activityId]: activity } };
    }
    default:
      return state;
  }
}

function withBadges(state: ProgressState, now: string): { readonly state: ProgressState; readonly newBadges: readonly string[] } {
  const newBadges = earnedBadgeIds(state).filter((id) => state.badges[id] === undefined);
  if (newBadges.length === 0) return { state, newBadges };
  const awarded = Object.fromEntries(newBadges.map((id) => [id, { awardedAt: now }]));
  return { state: { ...state, badges: { ...state.badges, ...awarded } }, newBadges };
}

/**
 * Застосовує навчальну подію до стану прогресу: XP лише за приріст понад уже нараховане, записи теми/тесту/
 * тренажера, нові бейджі з датою, ідемпотентність за ID події. Вхідний стан не змінюється.
 */
export function applyLearningEvent(state: ProgressState, event: LearningEvent, now: Date): Result<EventOutcome, GamificationError> {
  const problem = validateLearningEvent(event);
  if (problem) return err({ code: 'invalid-event', message: problem });

  const levelBefore = levelForXp(state.xp);
  if (state.recentEventIds.includes(event.id)) {
    return ok({ state, duplicate: true, xpGained: 0, newBadges: [], levelBefore, levelAfter: levelBefore, leveledUp: false });
  }

  const stamp = now.toISOString();
  const award = awardForEvent(event);
  const previousAward = state.xpLedger[award.key] ?? 0;
  const xpGained = Math.max(0, Math.min(award.amount - previousAward, PROGRESS_LIMITS.xp - state.xp));
  const withXp: ProgressState = {
    ...withRecords(state, event, stamp),
    updatedAt: stamp,
    xp: state.xp + xpGained,
    xpLedger: award.amount > previousAward ? { ...state.xpLedger, [award.key]: award.amount } : state.xpLedger,
    recentEventIds: [...state.recentEventIds, event.id].slice(-PROGRESS_LIMITS.recentEvents),
  };
  const { state: next, newBadges } = withBadges(withXp, stamp);

  if (!ProgressStateSchema.safeParse(next).success) {
    return err({ code: 'limit-exceeded', message: 'Досягнуто межі розміру прогресу — подію не записано. Скиньте прогрес карток або тем, які вже не потрібні.' });
  }
  const levelAfter = levelForXp(next.xp);
  return ok({ state: next, duplicate: false, xpGained, newBadges, levelBefore, levelAfter, leveledUp: levelAfter.minXp > levelBefore.minXp });
}
