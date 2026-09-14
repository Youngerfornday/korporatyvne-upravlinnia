import { z } from 'zod';
import {
  KebabIdSchema,
  LearningOutcomeIdSchema,
  ModuleIdSchema,
  NonEmptyTextSchema,
  SlugSchema,
  TopicIdSchema,
  findDuplicates,
  uniqueArray,
} from './primitives';

const HOURS_PER_CREDIT = 30;
const MAX_POINTS = 100;

const ModuleSchema = z.object({ id: ModuleIdSchema, title: NonEmptyTextSchema });

const TopicRegistrySchema = z.object({
  id: TopicIdSchema,
  module: ModuleIdSchema,
  slug: SlugSchema,
  title: NonEmptyTextSchema,
  summary: NonEmptyTextSchema,
});

/** Поля code, statement і topics опціональні, доки фаза 2 не заповнить ПРН (TODO). */
const LearningOutcomeSchema = z.object({
  id: LearningOutcomeIdSchema,
  code: NonEmptyTextSchema.optional(),
  statement: NonEmptyTextSchema.optional(),
  topics: uniqueArray(TopicIdSchema, 'Теми ПРН').optional(),
});

const GlossaryTermRegistrySchema = z.object({ id: KebabIdSchema, topic: TopicIdSchema });

const TeacherSchema = z.object({
  isPlaceholder: z.boolean(),
  name: NonEmptyTextSchema,
  position: NonEmptyTextSchema.optional(),
  email: z.email('Некоректна адреса e-mail').optional(),
});

const GradingCategorySchema = z.object({
  id: KebabIdSchema,
  stage: z.enum(['current', 'final']),
  title: NonEmptyTextSchema,
  items: z.int().positive(),
  pointsPerItem: z.number().positive(),
});

const GradingSchema = z.object({
  split: z.object({ current: z.number().min(0), final: z.number().min(0) }),
  categories: z.array(GradingCategorySchema).min(1),
});

const ScaleBandSchema = z.object({
  min: z.int().min(0).max(MAX_POINTS),
  max: z.int().min(0).max(MAX_POINTS),
  ects: z.enum(['A', 'B', 'C', 'D', 'E', 'FX', 'F']),
  national: NonEmptyTextSchema,
});

const PoliciesSchema = z.object({
  attendance: NonEmptyTextSchema,
  deadlines: NonEmptyTextSchema,
  academicIntegrity: NonEmptyTextSchema,
  ai: NonEmptyTextSchema,
  bonusPoints: NonEmptyTextSchema,
  retakes: NonEmptyTextSchema,
});

export const CourseSchema = z
  .object({
    schemaVersion: z.literal(1),
    status: z.enum(['draft', 'approved']),
    title: NonEmptyTextSchema,
    institution: NonEmptyTextSchema,
    institutionShort: NonEmptyTextSchema,
    educationLevel: NonEmptyTextSchema,
    language: z.literal('uk'),
    program: z
      .object({
        specialtyCode: NonEmptyTextSchema.optional(),
        specialtyTitle: NonEmptyTextSchema.optional(),
        educationalProgram: NonEmptyTextSchema.optional(),
      })
      .default({}),
    credits: z.int().positive(),
    hours: z.object({
      total: z.int().positive(),
      lectures: z.int().min(0),
      practicals: z.int().min(0),
      selfStudy: z.int().min(0),
    }),
    teacher: TeacherSchema,
    modules: z.array(ModuleSchema).min(1),
    topics: z.array(TopicRegistrySchema).min(1),
    learningOutcomes: z.array(LearningOutcomeSchema).default([]),
    glossaryTerms: z.array(GlossaryTermRegistrySchema).default([]),
    grading: GradingSchema,
    scale: z.array(ScaleBandSchema).min(1),
    policies: PoliciesSchema,
  })
  .superRefine((course, ctx) => {
    const report = (message: string, path: PropertyKey[]) => ctx.addIssue({ code: 'custom', message, path });
    checkRegistry(course, report);
    checkHours(course, report);
    checkGrading(course, report);
    checkScale(course, report);
  });

export type Course = z.infer<typeof CourseSchema>;
type CourseDraft = z.output<typeof CourseSchema>;
type Report = (message: string, path: PropertyKey[]) => void;

function reportDuplicates(values: readonly string[], label: string, path: PropertyKey[], report: Report): void {
  for (const duplicate of findDuplicates(values)) report(`Дублікат ${label} «${duplicate}» у реєстрі`, path);
}

function checkRegistry(course: CourseDraft, report: Report): void {
  const moduleIds = new Set(course.modules.map((m) => m.id));
  const topicIds = new Set(course.topics.map((t) => t.id));

  reportDuplicates(course.modules.map((m) => m.id), 'ID модуля', ['modules'], report);
  reportDuplicates(course.topics.map((t) => t.id), 'ID теми', ['topics'], report);
  reportDuplicates(course.topics.map((t) => t.slug), 'slug теми', ['topics'], report);
  reportDuplicates(course.learningOutcomes.map((o) => o.id), 'ID ПРН', ['learningOutcomes'], report);
  reportDuplicates(course.glossaryTerms.map((t) => t.id), 'ID терміна', ['glossaryTerms'], report);

  course.topics.forEach((topic, index) => {
    if (!moduleIds.has(topic.module)) report(`Тема «${topic.id}» посилається на невідомий модуль «${topic.module}»`, ['topics', index]);
  });
  for (const module of course.modules) {
    if (!course.topics.some((topic) => topic.module === module.id)) report(`Модуль «${module.id}» не має жодної теми`, ['modules']);
  }
  course.glossaryTerms.forEach((term, index) => {
    if (!topicIds.has(term.topic)) report(`Термін «${term.id}» посилається на невідому тему «${term.topic}»`, ['glossaryTerms', index]);
  });
  course.learningOutcomes.forEach((outcome, index) => {
    for (const topic of outcome.topics ?? []) {
      if (!topicIds.has(topic)) report(`ПРН «${outcome.id}» посилається на невідому тему «${topic}»`, ['learningOutcomes', index]);
    }
  });
}

function checkHours(course: CourseDraft, report: Report): void {
  const { total, lectures, practicals, selfStudy } = course.hours;
  if (lectures + practicals + selfStudy !== total) {
    report(`Сума годин (${lectures + practicals + selfStudy}) не дорівнює загальній кількості (${total})`, ['hours']);
  }
  if (course.credits * HOURS_PER_CREDIT !== total) {
    report(`${course.credits} кредит(и) ЄКТС = ${course.credits * HOURS_PER_CREDIT} год, а вказано ${total}`, ['credits']);
  }
}

function checkGrading(course: CourseDraft, report: Report): void {
  const { split, categories } = course.grading;
  reportDuplicates(categories.map((c) => c.id), 'ID категорії оцінювання', ['grading', 'categories'], report);

  if (split.current + split.final !== MAX_POINTS) {
    report(`Розподіл балів ${split.current}/${split.final} не дає ${MAX_POINTS}`, ['grading', 'split']);
  }
  for (const stage of ['current', 'final'] as const) {
    const sum = categories.filter((c) => c.stage === stage).reduce((acc, c) => acc + c.items * c.pointsPerItem, 0);
    if (Math.abs(sum - split[stage]) > 1e-9) {
      report(`Сума балів етапу ${stage} (${sum}) не дорівнює ${split[stage]}`, ['grading', 'categories']);
    }
  }
}

function checkScale(course: CourseDraft, report: Report): void {
  const bands = [...course.scale].sort((a, b) => a.min - b.min);
  let expectedMin = 0;
  for (const band of bands) {
    if (band.min > band.max || band.min !== expectedMin) {
      report(`Шкала оцінювання має розрив або перекриття біля ${band.min}–${band.max} (${band.ects})`, ['scale']);
      return;
    }
    expectedMin = band.max + 1;
  }
  if (expectedMin !== MAX_POINTS + 1) report(`Шкала оцінювання не покриває діапазон 0–${MAX_POINTS}`, ['scale']);
}
