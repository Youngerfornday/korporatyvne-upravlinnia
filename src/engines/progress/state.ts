import { z } from 'zod';

/** Поточна версія схеми прогресу. Зміна формату = нова версія + міграція в migrations.ts. */
export const PROGRESS_SCHEMA_VERSION = 1;

/** Межі розміру стану: захищають від зламаного або зловмисного коду прогресу. */
export const PROGRESS_LIMITS = {
  topics: 64,
  quizzes: 500,
  flashcards: 1000,
  activities: 200,
  badges: 100,
  attempts: 10_000,
  xp: 1_000_000,
} as const;

const MAX_ID_LENGTH = 64;
const MAX_FLASHCARD_BOX = 5;

/** Лише латиниця в нижньому регістрі, цифри, дефіс і підкреслення всередині — відсікає `__proto__` тощо. */
const EntityIdSchema = z
  .string()
  .max(MAX_ID_LENGTH)
  .regex(/^[a-z0-9]+(?:[-_][a-z0-9]+)*$/);

const IsoDateTimeSchema = z.iso.datetime({ offset: true });
const ScoreSchema = z.number().min(0).max(1);
const AttemptsSchema = z.int().min(1).max(PROGRESS_LIMITS.attempts);

function boundedRecord<T extends z.ZodType>(value: T, maxEntries: number) {
  return z
    .record(EntityIdSchema, value)
    .refine((record) => Object.keys(record).length <= maxEntries, {
      message: `Забагато записів (максимум ${maxEntries})`,
    });
}

export const TopicProgressSchema = z.object({
  status: z.enum(['in-progress', 'completed']),
  updatedAt: IsoDateTimeSchema,
});

export const QuizProgressSchema = z.object({
  attempts: AttemptsSchema,
  bestScore: ScoreSchema,
  lastAttemptAt: IsoDateTimeSchema,
});

export const FlashcardProgressSchema = z.object({
  box: z.int().min(0).max(MAX_FLASHCARD_BOX),
  reviewedAt: IsoDateTimeSchema,
});

export const ActivityProgressSchema = z.object({
  attempts: AttemptsSchema,
  bestScore: ScoreSchema,
  completedAt: IsoDateTimeSchema.optional(),
});

export const ProgressStateSchema = z.object({
  schemaVersion: z.literal(PROGRESS_SCHEMA_VERSION),
  updatedAt: IsoDateTimeSchema,
  xp: z.int().min(0).max(PROGRESS_LIMITS.xp),
  badges: z
    .array(EntityIdSchema)
    .max(PROGRESS_LIMITS.badges)
    .refine((badges) => new Set(badges).size === badges.length, { message: 'Бейджі не повинні повторюватися' }),
  topics: boundedRecord(TopicProgressSchema, PROGRESS_LIMITS.topics),
  quizzes: boundedRecord(QuizProgressSchema, PROGRESS_LIMITS.quizzes),
  flashcards: boundedRecord(FlashcardProgressSchema, PROGRESS_LIMITS.flashcards),
  activities: boundedRecord(ActivityProgressSchema, PROGRESS_LIMITS.activities),
});

export type ProgressState = z.infer<typeof ProgressStateSchema>;

export function createEmptyProgress(now: Date): ProgressState {
  return {
    schemaVersion: PROGRESS_SCHEMA_VERSION,
    updatedAt: now.toISOString(),
    xp: 0,
    badges: [],
    topics: {},
    quizzes: {},
    flashcards: {},
    activities: {},
  };
}
