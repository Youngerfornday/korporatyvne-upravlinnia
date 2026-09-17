import { z } from 'zod';
import { NonEmptyTextSchema } from './primitives';

/** Есе практичної: тема, ліміт слів, очікування рубрики й підказки. Спільне для всіх тренажерів. */
const MIN_ESSAY_WORDS = 100;

export const EssayTaskSchema = z.object({
  prompt: NonEmptyTextSchema,
  maxWords: z.int().min(MIN_ESSAY_WORDS),
  /** Що має бути в есе, щоб отримати вищий рівень за рубрикою course.yaml. */
  expectations: z.array(NonEmptyTextSchema).min(2),
  /** Підказки для розбору: на які норми і джерела спиратися. */
  hints: z.array(NonEmptyTextSchema).default([]),
});

export type EssayTask = z.infer<typeof EssayTaskSchema>;
