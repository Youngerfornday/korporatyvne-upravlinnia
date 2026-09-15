import { z } from 'zod';
import { PracticalIdSchema } from './course-shared';
import { KebabIdSchema, ModuleIdSchema, NonEmptyTextSchema, TopicIdSchema } from './primitives';

/** Календарний план: тиждень → види робіт. Лекція триває LECTURE_HOURS, години практичної — з її реєстру. */

export const LECTURE_HOURS = 2;

const ActivitySchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('lecture'), topic: TopicIdSchema }),
  z.object({ type: z.literal('practical'), practical: PracticalIdSchema }),
  z.object({ type: z.literal('module-test'), module: ModuleIdSchema }),
  z.object({ type: z.literal('case-project'), stage: KebabIdSchema }),
  z.object({ type: z.literal('final-test') }),
]);

export const CalendarSchema = z.object({
  weeks: z.int().positive(),
  note: NonEmptyTextSchema,
  schedule: z
    .array(z.object({ week: z.int().positive(), activities: z.array(ActivitySchema).min(1) }))
    .min(1),
});

export type CalendarActivity = z.infer<typeof ActivitySchema>;
