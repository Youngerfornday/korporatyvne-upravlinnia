import { err, ok, type Result } from '../shared/result';
import { shuffled, type RandomSource } from '../shared/random';
import { gradeResponse } from './grading';
import { GAVE_UP } from './grading/states';
import { createLayout } from './layout';
import type { GradeResult, Question, QuestionLayout, QuestionResponse } from './types';
import { validateResponse, type ResponseIssue } from './validation';

/**
 * Спроба тренувального тесту — незмінні дані. Кожна операція повертає нову спробу.
 * - `immediate` — як поведінка Moodle «миттєвий відгук»: відповідь оцінюється одразу й більше не змінюється;
 * - `deferred` — «відкладений відгук»: відповіді можна змінювати, оцінка — під час завершення.
 */
export type AttemptMode = 'immediate' | 'deferred';

export interface QuizSlot {
  readonly questionId: string;
  /** Максимальний бал слота (у Moodle — maxmark, типово дорівнює defaultmark питання). */
  readonly maxMark: number;
  readonly layout: QuestionLayout;
  readonly response: QuestionResponse | null;
  readonly grade: GradeResult | null;
  readonly answeredAt: string | null;
}

export interface QuizAttempt {
  readonly quizId: string;
  readonly mode: AttemptMode;
  readonly status: 'in-progress' | 'finished';
  readonly startedAt: string;
  readonly finishedAt: string | null;
  readonly slots: readonly QuizSlot[];
}

export interface StartAttemptOptions {
  readonly quizId: string;
  readonly questions: readonly Question[];
  readonly random: RandomSource;
  readonly now: Date;
  readonly mode?: AttemptMode;
  /** Налаштування тесту «Перемішувати питання». */
  readonly shuffleQuestions?: boolean;
  /** Налаштування тесту «Перемішувати варіанти відповідей». */
  readonly shuffleWithinQuestions?: boolean;
}

export type AttemptErrorCode = 'attempt-finished' | 'slot-not-found' | 'question-not-found' | 'already-answered' | 'invalid-response';

export interface AttemptError {
  readonly code: AttemptErrorCode;
  readonly message: string;
  readonly issue?: ResponseIssue;
}

const ATTEMPT_ERROR_MESSAGES: Readonly<Record<Exclude<AttemptErrorCode, 'invalid-response'>, string>> = {
  'attempt-finished': 'Спробу вже завершено — відповіді більше не приймаються.',
  'slot-not-found': 'Такого питання в цій спробі немає.',
  'question-not-found': 'Питання не знайдено в банку. Оновіть сторінку.',
  'already-answered': 'Відповідь на це питання вже надіслано.',
};

function attemptError(code: Exclude<AttemptErrorCode, 'invalid-response'>): { readonly ok: false; readonly error: AttemptError } {
  return err({ code, message: ATTEMPT_ERROR_MESSAGES[code] });
}

function findQuestion(questions: readonly Question[], id: string): Question | undefined {
  return questions.find((question) => question.id === id);
}

export function startAttempt(options: StartAttemptOptions): QuizAttempt {
  const { questions, random } = options;
  if (questions.length === 0) throw new RangeError('Тест не може бути порожнім');
  const ids = questions.map((question) => question.id);
  const duplicate = ids.find((id, index) => ids.indexOf(id) !== index);
  if (duplicate !== undefined) throw new RangeError(`Питання ${duplicate} додано до тесту двічі`);

  const ordered = options.shuffleQuestions === false ? [...questions] : shuffled(questions, random);
  const layoutOptions = { shuffleWithinQuestions: options.shuffleWithinQuestions ?? true };
  return {
    quizId: options.quizId,
    mode: options.mode ?? 'immediate',
    status: 'in-progress',
    startedAt: options.now.toISOString(),
    finishedAt: null,
    slots: ordered.map((question) => ({
      questionId: question.id,
      maxMark: question.defaultMark,
      layout: createLayout(question, random, layoutOptions),
      response: null,
      grade: null,
      answeredAt: null,
    })),
  };
}

export function answerQuestion(
  attempt: QuizAttempt,
  questions: readonly Question[],
  slotIndex: number,
  response: QuestionResponse,
  now: Date,
): Result<QuizAttempt, AttemptError> {
  if (attempt.status === 'finished') return attemptError('attempt-finished');
  const slot = attempt.slots[slotIndex];
  if (!slot) return attemptError('slot-not-found');
  const question = findQuestion(questions, slot.questionId);
  if (!question) return attemptError('question-not-found');
  if (attempt.mode === 'immediate' && slot.response !== null) return attemptError('already-answered');

  const problem = validateResponse(question, response);
  if (problem) return err({ code: 'invalid-response', message: problem.message, issue: problem });

  const updated: QuizSlot = {
    ...slot,
    response,
    grade: attempt.mode === 'immediate' ? gradeResponse(question, slot.layout, response) : null,
    answeredAt: now.toISOString(),
  };
  return ok({ ...attempt, slots: attempt.slots.map((current, index) => (index === slotIndex ? updated : current)) });
}

/** Завершує спробу: оцінює всі відповіді; питання без відповіді — «без відповіді», 0 балів. */
export function finishAttempt(attempt: QuizAttempt, questions: readonly Question[], now: Date): QuizAttempt {
  if (attempt.status === 'finished') return attempt;
  return {
    ...attempt,
    status: 'finished',
    finishedAt: now.toISOString(),
    slots: attempt.slots.map((slot) => {
      const question = findQuestion(questions, slot.questionId);
      const grade = question ? gradeResponse(question, slot.layout, slot.response) : GAVE_UP;
      return { ...slot, grade };
    }),
  };
}
