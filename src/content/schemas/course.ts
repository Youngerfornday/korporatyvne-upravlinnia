import { z } from 'zod';
import { GradingSchema, PoliciesSchema, ScaleBandSchema } from './course-assessment';
import { CalendarSchema } from './course-calendar';
import { checkCalendar } from './course-checks-calendar';
import { checkGrading, checkScale } from './course-checks-grading';
import { checkHours } from './course-checks-hours';
import {
  checkCases,
  checkCompetences,
  checkLiterature,
  checkOutcomeCoverage,
  checkPracticals,
  checkRegistry,
  checkRegulationRefs,
} from './course-checks-registry';
import { LiteratureSchema } from './course-literature';
import { PracticalSchema } from './course-practicals';
import { CompetenceSchema, CourseDescriptionShape, IntegralCompetenceSchema, LearningOutcomeSchema, ProgramSchema } from './course-program';
import { RegulationSchema, type Report } from './course-shared';
import { CaseSchema, GlossaryTermRegistrySchema, TopicRegistrySchema } from './course-topics';
import { ModuleIdSchema, NonEmptyTextSchema } from './primitives';

/**
 * Схема content/course.yaml — єдиного джерела правди про курс (сайт, силабус і робоча програма DOCX, Moodle).
 * Частини схеми — у course-*.ts, перехресні перевірки — у course-checks-*.ts.
 */

const ModuleSchema = z.object({ id: ModuleIdSchema, title: NonEmptyTextSchema });

const TeacherSchema = z.object({
  isPlaceholder: z.boolean(),
  name: NonEmptyTextSchema,
  position: NonEmptyTextSchema.optional(),
  email: z.email('Некоректна адреса e-mail').optional(),
});

const CourseObjectSchema = z.object({
  schemaVersion: z.literal(1),
  status: z.enum(['draft', 'approved']),
  title: NonEmptyTextSchema,
  institution: NonEmptyTextSchema,
  institutionShort: NonEmptyTextSchema,
  educationLevel: NonEmptyTextSchema,
  language: z.literal('uk'),
  program: ProgramSchema,
  ...CourseDescriptionShape,
  integralCompetence: IntegralCompetenceSchema,
  competences: z.array(CompetenceSchema).min(1),
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
  learningOutcomes: z.array(LearningOutcomeSchema).min(1),
  glossaryTerms: z.array(GlossaryTermRegistrySchema).min(1),
  cases: z.array(CaseSchema).min(1),
  practicals: z.array(PracticalSchema).min(1),
  regulations: z.array(RegulationSchema).min(1),
  grading: GradingSchema,
  scale: z.array(ScaleBandSchema).min(1),
  policies: PoliciesSchema,
  calendar: CalendarSchema,
  literature: LiteratureSchema,
});

export type CourseDraft = z.output<typeof CourseObjectSchema>;

const COURSE_CHECKS: ReadonlyArray<(course: CourseDraft, report: Report) => void> = [
  checkRegistry,
  checkOutcomeCoverage,
  checkCompetences,
  checkPracticals,
  checkCases,
  checkRegulationRefs,
  checkHours,
  checkGrading,
  checkScale,
  checkCalendar,
  checkLiterature,
];

export const CourseSchema = CourseObjectSchema.superRefine((course, ctx) => {
  const report: Report = (message, path) => ctx.addIssue({ code: 'custom', message, path });
  for (const check of COURSE_CHECKS) check(course, report);
});

export type Course = z.infer<typeof CourseSchema>;
