import { z } from 'zod';

/** Поточна версія схеми прогресу. Зміна формату = нова версія + міграція в migrations.ts. */
export const PROGRESS_SCHEMA_VERSION = 2;

/** Межі розміру стану: захищають від зламаного або зловмисного коду прогресу. */
export const PROGRESS_LIMITS = {
  topics: 64,
  quizzes: 500,
  flashcards: 1000,
  activities: 200,
  badges: 100,
  attempts: 10_000,
  xp: 1_000_000,
  /** Записів у журналі XP (по одному на тему, тест, тренажер тощо). */
  xpLedger: 2000,
  /** Найбільший внесок одного запису журналу. */
  xpPerAward: 10_000,
  /** Останні оброблені ID подій (кільцевий буфер для ідемпотентності). */
  recentEvents: 100,
  /** Розв’язаних варіантів одного тренажера. */
  solvedVariants: 50,
} as const;

const MAX_ID_LENGTH = 64;
const MAX_EVENT_ID_LENGTH = 120;
const MAX_FLASHCARD_BOX = 5;
const ID_PATTERN = '[a-z0-9]+(?:[-_][a-z0-9]+)*';

/** Лише латиниця в нижньому регістрі, цифри, дефіс і підкреслення всередині — відсікає `__proto__` тощо. */
const EntityIdSchema = z
  .string()
  .max(MAX_ID_LENGTH)
  .regex(new RegExp(`^${ID_PATTERN}$`));

/** Ключ журналу XP: `<вид нарахування>:<ID сутності>`, наприклад `quiz:t04-training`. */
const XpLedgerKeySchema = z
  .string()
  .max(MAX_ID_LENGTH * 2)
  .regex(new RegExp(`^[a-z]+(?:-[a-z]+)*:${ID_PATTERN}$`));

/** ID події: ті самі символи плюс `:` і `.` як роздільники. */
const EventIdSchema = z
  .string()
  .max(MAX_EVENT_ID_LENGTH)
  .regex(/^[a-z0-9]+(?:[-_:.][a-z0-9]+)*$/);

const IsoDateTimeSchema = z.iso.datetime({ offset: true });
const ScoreSchema = z.number().min(0).max(1);
const AttemptsSchema = z.int().min(1).max(PROGRESS_LIMITS.attempts);

function unique<T extends z.ZodType<string>>(item: T, max: number, label: string) {
  return z
    .array(item)
    .max(max)
    .refine((values) => new Set(values).size === values.length, { message: `${label} не повинні повторюватися` });
}

function boundedRecord<K extends z.ZodType<string>, T extends z.ZodType>(key: K, value: T, maxEntries: number) {
  return z.record(key, value).refine((record) => Object.keys(record).length <= maxEntries, {
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
  /** Варіанти задач, розв’язані без помилок (для бейджа «Кворум зібрано» тощо). */
  solvedVariants: unique(EntityIdSchema, PROGRESS_LIMITS.solvedVariants, 'Розв’язані варіанти').optional(),
});

export const BadgeAwardSchema = z.object({ awardedAt: IsoDateTimeSchema });

export const ProgressStateSchema = z.object({
  schemaVersion: z.literal(PROGRESS_SCHEMA_VERSION),
  updatedAt: IsoDateTimeSchema,
  xp: z.int().min(0).max(PROGRESS_LIMITS.xp),
  /** Скільки XP уже нараховано за кожну сутність: повтор дає лише приріст понад цей максимум. */
  xpLedger: boundedRecord(XpLedgerKeySchema, z.int().min(0).max(PROGRESS_LIMITS.xpPerAward), PROGRESS_LIMITS.xpLedger),
  badges: boundedRecord(EntityIdSchema, BadgeAwardSchema, PROGRESS_LIMITS.badges),
  recentEventIds: z.array(EventIdSchema).max(PROGRESS_LIMITS.recentEvents),
  topics: boundedRecord(EntityIdSchema, TopicProgressSchema, PROGRESS_LIMITS.topics),
  quizzes: boundedRecord(EntityIdSchema, QuizProgressSchema, PROGRESS_LIMITS.quizzes),
  flashcards: boundedRecord(EntityIdSchema, FlashcardProgressSchema, PROGRESS_LIMITS.flashcards),
  activities: boundedRecord(EntityIdSchema, ActivityProgressSchema, PROGRESS_LIMITS.activities),
});

export type ProgressState = z.infer<typeof ProgressStateSchema>;
export type ActivityProgress = z.infer<typeof ActivityProgressSchema>;
export type QuizProgress = z.infer<typeof QuizProgressSchema>;

export function createEmptyProgress(now: Date): ProgressState {
  return {
    schemaVersion: PROGRESS_SCHEMA_VERSION,
    updatedAt: now.toISOString(),
    xp: 0,
    xpLedger: {},
    badges: {},
    recentEventIds: [],
    topics: {},
    quizzes: {},
    flashcards: {},
    activities: {},
  };
}

/** Види нарахувань XP, які використовують рушій геймифікації й міграції. */
export type XpAwardKind = 'topic-read' | 'self-check' | 'quiz' | 'flashcards' | 'case' | 'trainer';

export function xpLedgerKey(kind: XpAwardKind, entityId: string): string {
  return `${kind}:${entityId}`;
}
