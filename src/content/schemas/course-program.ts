import { z } from 'zod';
import { CompetenceIdSchema, ConfirmableSchema, PracticalIdSchema, ResearchRefSchema } from './course-shared';
import { HttpUrlSchema, LearningOutcomeIdSchema, NonEmptyTextSchema, TopicIdSchema, uniqueArray } from './primitives';

/** Освітня рамка курсу: спеціальність, статус дисципліни, компетентності й ПРН (для силабусу й робочої програми). */

const NQF_BACHELOR_LEVEL = 6;

const SpecialtyCorrespondenceSchema = z.object({
  code: NonEmptyTextSchema,
  title: NonEmptyTextSchema,
  fieldOfKnowledge: NonEmptyTextSchema,
  basis: NonEmptyTextSchema,
  url: HttpUrlSchema,
  ref: ResearchRefSchema,
});

const StandardSchema = z.object({
  title: NonEmptyTextSchema,
  approval: NonEmptyTextSchema,
  url: HttpUrlSchema,
  ref: ResearchRefSchema,
});

export const ProgramSchema = z.object({
  specialtyCode: NonEmptyTextSchema,
  specialtyTitle: NonEmptyTextSchema,
  educationalProgram: NonEmptyTextSchema,
  fieldOfKnowledge: NonEmptyTextSchema,
  specialtyCorrespondence: SpecialtyCorrespondenceSchema,
  specialtyRecord: ConfirmableSchema,
  standard: StandardSchema,
  nqfLevel: z.literal(NQF_BACHELOR_LEVEL),
  qualification: NonEmptyTextSchema,
  disciplineStatus: ConfirmableSchema,
  finalControl: ConfirmableSchema,
  semester: ConfirmableSchema,
  volume: ConfirmableSchema,
  instructionLanguage: NonEmptyTextSchema,
  prerequisites: z.array(NonEmptyTextSchema).min(1),
  postrequisites: z.array(NonEmptyTextSchema).min(1),
});

export const IntegralCompetenceSchema = z.object({ statement: NonEmptyTextSchema, ref: ResearchRefSchema });

/** ЗК і СК: формулювання зі стандарту (source: standard) дослівно, власні коди ОП — source: program. */
export const CompetenceSchema = z.object({
  id: CompetenceIdSchema,
  code: NonEmptyTextSchema,
  kind: z.enum(['general', 'special']),
  source: z.enum(['standard', 'program']),
  statement: NonEmptyTextSchema,
  topics: uniqueArray(TopicIdSchema, 'Теми компетентності').min(1),
});

/**
 * Програмний результат навчання. `topics` і `practicals` мають збігатися з тим, що заявляють результати тем
 * і реєстр практичних: перевірка в superRefine курсу не дає двом джерелам розійтися.
 */
export const LearningOutcomeSchema = z.object({
  id: LearningOutcomeIdSchema,
  code: NonEmptyTextSchema,
  statement: NonEmptyTextSchema,
  topics: uniqueArray(TopicIdSchema, 'Теми ПРН'),
  practicals: uniqueArray(PracticalIdSchema, 'Практичні ПРН'),
});

export const CourseDescriptionShape = {
  annotation: NonEmptyTextSchema,
  goal: NonEmptyTextSchema,
  objectives: z.array(NonEmptyTextSchema).min(3),
};
