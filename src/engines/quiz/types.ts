import type { Question } from '../../content/schemas/questions';

export type { Question };
export type QuestionType = Question['type'];
export type QuestionOf<T extends QuestionType> = Extract<Question, { type: T }>;

/** Стани Moodle `question_state`: gradedright / gradedpartial / gradedwrong / gaveup. */
export type QuestionState = 'right' | 'partial' | 'wrong' | 'gaveup';

export interface GradeResult {
  /** Частка оцінки питання; як у Moodle, може бути від’ємною (одиночний вибір зі штрафом). */
  readonly fraction: number;
  readonly state: QuestionState;
}

/**
 * Розкладка питання в конкретній спробі — аналог `_order`, `_stemorder`, `_choiceorder`, `_var_*`,
 * які Moodle зберігає в першому кроці спроби. Індекси — позиції в масивах питання банку.
 */
export type QuestionLayout =
  | { readonly type: 'multichoice'; readonly order: readonly number[] }
  | { readonly type: 'truefalse' }
  | { readonly type: 'matching'; readonly stemOrder: readonly number[]; readonly choiceOrder: readonly number[] }
  | { readonly type: 'numerical' }
  | { readonly type: 'calculated'; readonly variant: number; readonly values: Readonly<Record<string, number>> }
  | { readonly type: 'ddwtos'; readonly choiceOrder: readonly number[] }
  | { readonly type: 'multianswer'; readonly partOrders: readonly (readonly number[] | null)[] };

export type LayoutOf<T extends QuestionType> = Extract<QuestionLayout, { type: T }>;

/**
 * Відповідь студента. Індекси — позиції в масивах питання банку (не в перемішаному порядку показу).
 * - multichoice: вибрані варіанти `answers[i]`;
 * - matching: для кожної пари `pairs[i]` — індекс у `matchingChoices(question)` або null;
 * - ddwtos: для кожного пропуску в порядку появи в стовбурі — індекс `choices[i]` або null;
 * - multianswer: для кожного підпитання — індекс варіанта (multichoice), текст (shortanswer, numerical) або null.
 */
export type QuestionResponse =
  | { readonly type: 'multichoice'; readonly selected: readonly number[] }
  | { readonly type: 'truefalse'; readonly value: boolean }
  | { readonly type: 'matching'; readonly selections: readonly (number | null)[] }
  | { readonly type: 'numerical'; readonly answer: string }
  | { readonly type: 'calculated'; readonly answer: string }
  | { readonly type: 'ddwtos'; readonly gaps: readonly (number | null)[] }
  | { readonly type: 'multianswer'; readonly parts: readonly (number | string | null)[] };

export type ResponseOf<T extends QuestionType> = Extract<QuestionResponse, { type: T }>;
