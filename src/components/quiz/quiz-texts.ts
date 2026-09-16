/** Тексти інтерфейсу тренувального тесту (українська, без емодзі). */
import type { BloomLevel } from '../../content/schemas/questions';
import type { Question, QuestionState } from '../../engines/quiz';
import { formatNumber, roundTo } from '../../engines/shared/number-format';
import { pluralUk } from '../../lib/plural';

export const OPTION_LETTERS = ['А', 'Б', 'В', 'Г', 'Д', 'Е', 'Ж', 'З', 'И', 'К'] as const;

export const BLOOM_LABELS: Readonly<Record<BloomLevel, string>> = {
  remember: 'Запам’ятовування',
  understand: 'Розуміння',
  apply: 'Застосування',
  analyze: 'Аналіз',
};

export function questionTypeLabel(question: Question): string {
  switch (question.type) {
    case 'multichoice':
      return question.single ? 'одиночний вибір' : 'множинний вибір';
    case 'truefalse':
      return 'правда чи неправда';
    case 'matching':
      return 'відповідність';
    case 'numerical':
      return 'числова відповідь';
    case 'calculated':
      return 'розрахунок';
    case 'ddwtos':
      return 'заповнення пропусків';
    default:
      return 'кейс із пропусками';
  }
}

const MARK_FORMS = { one: 'бал', few: 'бали', many: 'балів', other: 'бала' } as const;
const MARK_GENITIVE = { one: 'бала', few: 'балів', many: 'балів', other: 'бала' } as const;
const QUESTION_FORMS = { one: 'питання', few: 'питання', many: 'питань', other: 'питання' } as const;
const MARK_DECIMALS = 2;

/** «1 бал», «0,5 бала». */
export function marksText(marks: number): string {
  return pluralUk(roundTo(marks, MARK_DECIMALS), MARK_FORMS);
}

/** «0,5 з 1 бала». */
export function marksOfText(marks: number, maxMark: number): string {
  return `${formatNumber(roundTo(marks, MARK_DECIMALS))} з ${pluralUk(roundTo(maxMark, MARK_DECIMALS), MARK_GENITIVE)}`;
}

export function questionsText(count: number): string {
  return pluralUk(count, QUESTION_FORMS);
}

export const STATE_SHORT: Readonly<Record<QuestionState, string>> = {
  right: 'правильно',
  partial: 'частково',
  wrong: 'неправильно',
  gaveup: 'без відповіді',
};

export const NUMBER_HINT = 'Десятковий знак — кома, наприклад 1,5. Без одиниць виміру.';
export const VERDICT_HEADING: Readonly<Record<QuestionState, string>> = {
  right: 'Правильно',
  partial: 'Частково правильно',
  wrong: 'Неправильно',
  gaveup: 'Без відповіді',
};
