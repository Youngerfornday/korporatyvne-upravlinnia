import { ProgressStateV1Schema, type ProgressStateV1 } from './schema-v1';
import { PROGRESS_LIMITS, xpLedgerKey } from './state';

/**
 * Правила XP на момент появи версії 2 (заморожено разом із міграцією; поточні правила — у
 * gamification/xp-rules.ts, тест там перевіряє, що на момент v2 вони збігалися).
 */
export const V2_LEDGER_RULES = { topicRead: 100, quizMax: 150, trainerMax: 60 } as const;

function ledgerFromV1(v1: ProgressStateV1): Record<string, number> {
  const topics = Object.entries(v1.topics)
    .filter(([, topic]) => topic.status === 'completed')
    .map(([id]) => [xpLedgerKey('topic-read', id), V2_LEDGER_RULES.topicRead] as const);
  const quizzes = Object.entries(v1.quizzes).map(
    ([id, quiz]) => [xpLedgerKey('quiz', id), Math.round(V2_LEDGER_RULES.quizMax * quiz.bestScore)] as const,
  );
  const activities = Object.entries(v1.activities).map(
    ([id, activity]) => [xpLedgerKey('trainer', id), Math.round(V2_LEDGER_RULES.trainerMax * activity.bestScore)] as const,
  );
  return Object.fromEntries([...topics, ...quizzes, ...activities].filter(([, amount]) => amount > 0));
}

/**
 * v1 → v2: список бейджів стає записами з датою (відома лише дата останнього оновлення v1),
 * журнал XP відновлюється із записаного прогресу — інакше повторне читання теми нарахувало б XP
 * удруге; XP не зменшується. Невалідні дані v1 кидають виняток → migrateProgress поверне 'invalid-data'.
 */
export function migrateV1ToV2(input: Readonly<Record<string, unknown>>): Record<string, unknown> {
  const v1 = ProgressStateV1Schema.parse(input);
  const xpLedger = ledgerFromV1(v1);
  const ledgerTotal = Object.values(xpLedger).reduce((acc, amount) => acc + amount, 0);
  return {
    schemaVersion: 2,
    updatedAt: v1.updatedAt,
    xp: Math.min(Math.max(v1.xp, ledgerTotal), PROGRESS_LIMITS.xp),
    xpLedger,
    badges: Object.fromEntries(v1.badges.map((id) => [id, { awardedAt: v1.updatedAt }])),
    recentEventIds: [],
    topics: v1.topics,
    quizzes: v1.quizzes,
    flashcards: v1.flashcards,
    activities: v1.activities,
  };
}
