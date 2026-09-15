import { z } from 'zod';
import { ResearchRefSchema } from './course-shared';
import {
  KebabIdSchema,
  LearningOutcomeIdSchema,
  ModuleIdSchema,
  NonEmptyTextSchema,
  SlugSchema,
  TopicIdSchema,
  uniqueArray,
} from './primitives';

/** Реєстр тем з усім, що потрібно для робочої програми й паралельного написання контенту. */

const RESULTS_MESSAGE = 'Тема має 3–4 результати навчання';
const QUESTIONS_MESSAGE = 'Зміст теми — 5–8 питань лекції';

const TopicResultSchema = z.object({
  statement: NonEmptyTextSchema,
  prn: uniqueArray(LearningOutcomeIdSchema, 'ПРН результату навчання').min(1),
});

const SelfStudyTaskSchema = z.object({ task: NonEmptyTextSchema, hours: z.int().positive() });

/** Кейс у темі: повна фабула — лише в основній темі кейсу, в інших — окремий аспект (focus). */
const TopicCaseSchema = z.object({ case: KebabIdSchema, focus: NonEmptyTextSchema });

export const TopicRegistrySchema = z.object({
  id: TopicIdSchema,
  module: ModuleIdSchema,
  slug: SlugSchema,
  title: NonEmptyTextSchema,
  summary: NonEmptyTextSchema,
  results: z.array(TopicResultSchema).min(3, RESULTS_MESSAGE).max(4, RESULTS_MESSAGE),
  lectureQuestions: z.array(NonEmptyTextSchema).min(5, QUESTIONS_MESSAGE).max(8, QUESTIONS_MESSAGE),
  hours: z.object({ lectures: z.int().positive(), selfStudy: z.int().positive() }),
  selfStudyTasks: z.array(SelfStudyTaskSchema).min(1),
  cases: z.array(TopicCaseSchema).min(2),
});

export const CaseSchema = z.object({
  id: KebabIdSchema,
  title: NonEmptyTextSchema,
  region: z.enum(['ua', 'international']),
  /** Тема, де розповідається повна фабула кейсу. */
  primaryTopic: TopicIdSchema,
  ref: ResearchRefSchema,
  /** Що не підтверджено першоджерелом і не може йти в контент як факт. */
  caveat: NonEmptyTextSchema.optional(),
});

export const GlossaryTermRegistrySchema = z.object({ id: KebabIdSchema, topic: TopicIdSchema, term: NonEmptyTextSchema });
