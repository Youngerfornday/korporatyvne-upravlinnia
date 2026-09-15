import { z } from 'zod';

/**
 * Замороджений знімок схеми прогресу версії 1 — лише для міграції 1 → 2. Не змінювати:
 * збережені в браузерах дані v1 мають читатися саме так, як їх записала перша версія сайту.
 */
const EntityIdSchema = z
  .string()
  .max(64)
  .regex(/^[a-z0-9]+(?:[-_][a-z0-9]+)*$/);
const IsoDateTimeSchema = z.iso.datetime({ offset: true });
const ScoreSchema = z.number().min(0).max(1);
const AttemptsSchema = z.int().min(1).max(10_000);

function boundedRecord<T extends z.ZodType>(value: T, maxEntries: number) {
  return z.record(EntityIdSchema, value).refine((record) => Object.keys(record).length <= maxEntries);
}

export const ProgressStateV1Schema = z.object({
  schemaVersion: z.literal(1),
  updatedAt: IsoDateTimeSchema,
  xp: z.int().min(0).max(1_000_000),
  badges: z
    .array(EntityIdSchema)
    .max(100)
    .refine((badges) => new Set(badges).size === badges.length),
  topics: boundedRecord(z.object({ status: z.enum(['in-progress', 'completed']), updatedAt: IsoDateTimeSchema }), 64),
  quizzes: boundedRecord(z.object({ attempts: AttemptsSchema, bestScore: ScoreSchema, lastAttemptAt: IsoDateTimeSchema }), 500),
  flashcards: boundedRecord(z.object({ box: z.int().min(0).max(5), reviewedAt: IsoDateTimeSchema }), 1000),
  activities: boundedRecord(
    z.object({ attempts: AttemptsSchema, bestScore: ScoreSchema, completedAt: IsoDateTimeSchema.optional() }),
    200,
  ),
});

export type ProgressStateV1 = z.infer<typeof ProgressStateV1Schema>;
