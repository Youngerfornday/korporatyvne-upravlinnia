import { z } from 'zod';
import { ModuleIdSchema, findDuplicates } from './primitives';
import {
  DdwtosQuestionSchema,
  MatchingQuestionSchema,
  MultichoiceQuestionSchema,
  TrueFalseQuestionSchema,
} from './question-types/choice';
import { MultianswerQuestionSchema } from './question-types/cloze';
import { CalculatedQuestionSchema, NumericalQuestionSchema } from './question-types/numeric';

export { BloomLevelSchema, MOODLE_GRADE_PERCENTS, type BloomLevel } from './question-types/shared';

/**
 * Префікс canary-рядка контрольних банків. Склеюється під час виконання, щоб жоден файл
 * публічного репозиторію (і зібраний JS) не містив цей рядок цілком: його шукає check:dist.
 */
export const CONTROL_CANARY_PREFIX = ['KU', 'CONTROL', 'CANARY', ''].join('-');

/** Питання банку — дзеркало типів Moodle XML. Схема однакова для тренувальних і контрольних банків. */
export const QuestionSchema = z.discriminatedUnion('type', [
  MultichoiceQuestionSchema,
  TrueFalseQuestionSchema,
  MatchingQuestionSchema,
  NumericalQuestionSchema,
  CalculatedQuestionSchema,
  DdwtosQuestionSchema,
  MultianswerQuestionSchema,
]);

export type Question = z.infer<typeof QuestionSchema>;
export type QuestionType = Question['type'];

const CANARY_SUFFIX = /^[A-Za-z0-9][A-Za-z0-9-]*$/;

/**
 * ID питання залежить від виду банку: тренувальні — `tNN-qNNN`, контрольні — `tNN-kNNN`.
 * Так idnumber у Moodle ніколи не збігаються, навіть якщо викладач імпортує обидва банки в один курс.
 */
const QUESTION_ID = {
  training: { pattern: /^t\d{2}-q\d{3}$/, shape: 'tNN-qNNN', example: 't04-q001', label: 'тренувального' },
  control: { pattern: /^t\d{2}-k\d{3}$/, shape: 'tNN-kNNN', example: 't04-k001', label: 'контрольного' },
} as const;

/**
 * Файл банку: `content/banks/training/mN.yaml` (публічний) або `banks/control/mN.yaml` і
 * `banks/control/final.yaml` (лише приватний репозиторій). Контрольний банк обов’язково має canary;
 * тренувальний — ні. Один файл — це один модуль і один пул тесту.
 */
export const BankFileSchema = z
  .object({
    schemaVersion: z.literal(1),
    kind: z.enum(['training', 'control']),
    /**
     * Пул тесту, який живиться з банку: `module` — модульний тест (типово), `final` — підсумковий.
     * Пули не змішуються: у Moodle це різні гілки категорій, тож випадковий слот модульного тесту
     * ніколи не візьме питання підсумкового пулу з тієї самої теми.
     */
    pool: z.enum(['module', 'final']).default('module'),
    module: ModuleIdSchema,
    canary: z.string().optional(),
    questions: z.array(QuestionSchema).min(1),
  })
  .superRefine((bank, ctx) => {
    if (bank.kind === 'control') {
      const suffix = bank.canary?.startsWith(CONTROL_CANARY_PREFIX) ? bank.canary.slice(CONTROL_CANARY_PREFIX.length) : null;
      if (suffix === null || !CANARY_SUFFIX.test(suffix)) {
        ctx.addIssue({
          code: 'custom',
          message: 'Контрольний банк має містити поле canary: префікс контрольного canary і непорожній суфікс',
          path: ['canary'],
        });
      }
    }
    if (bank.kind === 'training' && bank.canary !== undefined) {
      ctx.addIssue({ code: 'custom', message: 'Тренувальний банк не повинен мати поле canary', path: ['canary'] });
    }
    const { pattern, shape, example, label } = QUESTION_ID[bank.kind];
    bank.questions.forEach((question, index) => {
      if (!pattern.test(question.id)) {
        ctx.addIssue({
          code: 'custom',
          message: `ID ${label} питання має вигляд ${shape} (наприклад ${example})`,
          path: ['questions', index, 'id'],
        });
      }
    });
    for (const id of findDuplicates(bank.questions.map((q) => q.id))) {
      ctx.addIssue({ code: 'custom', message: `Дублікат ID питання «${id}»`, path: ['questions'] });
    }
  });

export type BankFile = z.infer<typeof BankFileSchema>;
