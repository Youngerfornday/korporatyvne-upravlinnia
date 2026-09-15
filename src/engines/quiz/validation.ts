import { parseMoodleNumber } from '../shared/decimal-input';
import { ddwtosGaps, matchingChoices } from './grading/choice';
import type { Question, QuestionOf, QuestionResponse, ResponseOf } from './types';

/**
 * Перевірка відповіді перед записом — аналог `get_validation_error` / `is_complete_response` Moodle,
 * які в поведінці «миттєвий відгук» не дають надіслати неповну відповідь.
 */
export type ResponseIssueCode =
  | 'type-mismatch'
  | 'incomplete'
  | 'invalid-choice'
  | 'duplicate-choice'
  | 'wrong-group'
  | 'invalid-number'
  | 'number-with-unit';

export interface ResponseIssue {
  readonly code: ResponseIssueCode;
  readonly message: string;
  /** Номер частини Cloze (з 1), якщо проблема в ній. */
  readonly part?: number;
}

export const RESPONSE_ISSUE_MESSAGES: Readonly<Record<ResponseIssueCode, string>> = {
  'type-mismatch': 'Відповідь не відповідає типу питання.',
  incomplete: 'Дайте відповідь на всі частини питання.',
  'invalid-choice': 'Вибрано варіант, якого немає в цьому питанні.',
  'duplicate-choice': 'Той самий варіант використано кілька разів.',
  'wrong-group': 'Цей варіант не підходить до вибраного пропуску.',
  'invalid-number': 'Введіть число, наприклад 1,5.',
  'number-with-unit': 'Введіть лише число, без одиниць виміру.',
};

function issue(code: ResponseIssueCode, part?: number): ResponseIssue {
  return part === undefined ? { code, message: RESPONSE_ISSUE_MESSAGES[code] } : { code, message: RESPONSE_ISSUE_MESSAGES[code], part };
}

function isIndex(value: number, length: number): boolean {
  return Number.isInteger(value) && value >= 0 && value < length;
}

function validateMultichoice(question: QuestionOf<'multichoice'>, response: ResponseOf<'multichoice'>): ResponseIssue | null {
  if (response.selected.length === 0) return issue('incomplete');
  if (response.selected.some((index) => !isIndex(index, question.answers.length))) return issue('invalid-choice');
  if (question.single && response.selected.length > 1) return issue('invalid-choice');
  if (new Set(response.selected).size !== response.selected.length) return issue('duplicate-choice');
  return null;
}

function validateMatching(question: QuestionOf<'matching'>, response: ResponseOf<'matching'>): ResponseIssue | null {
  const choiceCount = matchingChoices(question).length;
  if (response.selections.length !== question.pairs.length || response.selections.includes(null)) return issue('incomplete');
  return response.selections.every((selection) => selection !== null && isIndex(selection, choiceCount)) ? null : issue('invalid-choice');
}

function validateNumber(answer: string, part?: number): ResponseIssue | null {
  if (answer.trim() === '') return issue('incomplete', part);
  const parsed = parseMoodleNumber(answer);
  if (parsed.value === null || !Number.isFinite(parsed.value)) return issue('invalid-number', part);
  return parsed.rest === '' ? null : issue('number-with-unit', part);
}

function validateDdwtos(question: QuestionOf<'ddwtos'>, response: ResponseOf<'ddwtos'>): ResponseIssue | null {
  const gaps = ddwtosGaps(question);
  if (response.gaps.length !== gaps.length) return issue('incomplete');
  for (const [index, gap] of gaps.entries()) {
    const chosen = response.gaps[index];
    if (chosen === null || chosen === undefined) return issue('incomplete');
    const choice = isIndex(chosen, question.choices.length) ? question.choices[chosen] : undefined;
    if (!choice) return issue('invalid-choice');
    if (choice.group !== gap.group) return issue('wrong-group');
  }
  const used = response.gaps.filter((chosen): chosen is number => chosen !== null && !question.choices[chosen]?.infinite);
  return new Set(used).size === used.length ? null : issue('duplicate-choice');
}

function validateMultianswer(question: QuestionOf<'multianswer'>, response: ResponseOf<'multianswer'>): ResponseIssue | null {
  for (const [index, subquestion] of question.subquestions.entries()) {
    const part = response.parts[index] ?? null;
    const number = index + 1;
    if (subquestion.kind === 'multichoice') {
      if (typeof part !== 'number') return issue('incomplete', number);
      if (!isIndex(part, subquestion.answers.length)) return issue('invalid-choice', number);
      continue;
    }
    if (typeof part !== 'string' || part.trim() === '') return issue('incomplete', number);
    const numberIssue = subquestion.kind === 'numerical' ? validateNumber(part, number) : null;
    if (numberIssue) return numberIssue;
  }
  return null;
}

export function validateResponse(question: Question, response: QuestionResponse): ResponseIssue | null {
  if (response.type !== question.type) return issue('type-mismatch');
  switch (question.type) {
    case 'multichoice':
      return validateMultichoice(question, response as ResponseOf<'multichoice'>);
    case 'truefalse':
      return null;
    case 'matching':
      return validateMatching(question, response as ResponseOf<'matching'>);
    case 'numerical':
    case 'calculated':
      return validateNumber((response as ResponseOf<'numerical' | 'calculated'>).answer);
    case 'ddwtos':
      return validateDdwtos(question, response as ResponseOf<'ddwtos'>);
    default:
      return validateMultianswer(question, response as ResponseOf<'multianswer'>);
  }
}
