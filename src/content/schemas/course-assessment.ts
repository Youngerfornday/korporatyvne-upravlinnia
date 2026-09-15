import { z } from 'zod';
import { CaseProjectRubricSchema } from './course-practicals';
import { ConfirmableSchema, RegulationRefSchema, requiresNote, CONFIRMATION_NOTE_MESSAGE } from './course-shared';
import { KebabIdSchema, NonEmptyTextSchema, TopicIdSchema } from './primitives';

/** Журнал оцінок, тести, кейс-проєкт, допуск, додаткові бали, шкала і політики курсу. */

export const MAX_POINTS = 100;
export const MAX_BONUS_POINTS = 10;
export const PERCENT = 100;

const GradingCategorySchema = z.object({
  id: KebabIdSchema,
  stage: z.enum(['current', 'final']),
  title: NonEmptyTextSchema,
  items: z.int().positive(),
  pointsPerItem: z.number().positive(),
});

/** Кількість питань (або відсотків) за рівнями Блума; ключі збігаються з BloomLevelSchema. */
const BloomCountsShape = {
  remember: z.int().min(0),
  understand: z.int().min(0),
  apply: z.int().min(0),
  analyze: z.int().min(0),
};
const BloomCountsSchema = z.object(BloomCountsShape);

const ModuleTestsSchema = z.object({
  questions: z.int().positive(),
  timeLimitMinutes: z.int().positive(),
  attempts: z.int().positive(),
  bankPerModule: z.int().positive(),
  bloom: BloomCountsSchema,
});

const FinalTestSchema = z.object({
  questions: z.int().positive(),
  timeLimitMinutes: z.int().positive(),
  attempts: z.int().positive(),
  bankSize: z.int().positive(),
  /** Цільові частки рівнів Блума у відсотках. */
  targetShare: BloomCountsSchema,
  /** Явна матриця «теми × рівні Блума»: скільки питань кожного рівня бере тест з банку теми. */
  matrix: z.array(z.object({ topic: TopicIdSchema, ...BloomCountsShape })).min(1),
});

const CaseProjectSchema = z.object({
  title: NonEmptyTextSchema,
  goal: NonEmptyTextSchema,
  companyCriteria: z.array(NonEmptyTextSchema).min(1),
  stages: z.array(z.object({ id: KebabIdSchema, title: NonEmptyTextSchema, deliverable: NonEmptyTextSchema })).min(1),
  rubric: CaseProjectRubricSchema,
});

const AdmissionSchema = z.object({
  minCurrentPoints: z.number().min(0),
  conditions: z.array(NonEmptyTextSchema).min(1),
  currentScoreOption: NonEmptyTextSchema,
  basis: z.array(RegulationRefSchema).min(1),
});

const BonusSchema = z.object({
  maxPoints: z.number().positive().max(MAX_BONUS_POINTS),
  activities: z.array(z.object({ title: NonEmptyTextSchema, maxPoints: z.number().positive() })).min(1),
  rule: NonEmptyTextSchema,
});

export const GradingSchema = z.object({
  split: z.object({ current: z.number().min(0), final: z.number().min(0) }),
  categories: z.array(GradingCategorySchema).min(1),
  moduleTests: ModuleTestsSchema,
  finalTest: FinalTestSchema,
  caseProject: CaseProjectSchema,
  admission: AdmissionSchema,
  bonus: BonusSchema,
  scaleBasis: RegulationRefSchema,
});

export const ScaleBandSchema = z.object({
  min: z.int().min(0).max(MAX_POINTS),
  max: z.int().min(0).max(MAX_POINTS),
  ects: z.enum(['A', 'B', 'C', 'D', 'E', 'FX', 'F']),
  national: NonEmptyTextSchema,
});

/** Моделі політики щодо ШІ з Положення університету про робочі програми та силабуси. */
const AI_POLICY_MODELS = ['full-ban', 'partial-with-citation', 'mandatory-tool', 'free-choice'] as const;

const AiModelSchema = z
  .object({
    model: z.enum(AI_POLICY_MODELS),
    title: NonEmptyTextSchema,
    rationale: NonEmptyTextSchema,
    rules: z.array(NonEmptyTextSchema).min(1),
    needsConfirmation: z.boolean(),
    note: NonEmptyTextSchema.optional(),
    basis: z.array(RegulationRefSchema).min(1),
  })
  .refine(requiresNote, { message: CONFIRMATION_NOTE_MESSAGE, path: ['note'] });

export const PoliciesSchema = z.object({
  attendance: NonEmptyTextSchema,
  deadlines: NonEmptyTextSchema,
  academicIntegrity: NonEmptyTextSchema,
  ai: NonEmptyTextSchema,
  bonusPoints: NonEmptyTextSchema,
  retakes: NonEmptyTextSchema,
  aiModel: AiModelSchema,
  nonFormalEducation: ConfirmableSchema,
  basis: z.array(RegulationRefSchema).min(1),
});
