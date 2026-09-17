import { pluralUk } from '../../lib/plural';
import { formatNumber, formatPercent, roundTo } from '../shared/number-format';
import { rubricMark, type RubricBand, type RubricMark } from './rubric';
import type { MatrixErrorCode, MatrixItemState } from './types';

/** Тексти тренажера-матриці українською: стани словом, підсумки для aria-live, повідомлення про помилки. */

export const MATRIX_ERROR_MESSAGES: Readonly<Record<MatrixErrorCode, string>> = {
  finished: 'Спробу вже завершено — відповіді не змінюються.',
  'unknown-item': 'Такого формулювання в цій спробі немає.',
  'unknown-model': 'Такої моделі в матриці немає.',
  'unknown-feature': 'Такої ознаки в цій спробі немає.',
  locked: 'Ознаку вже перевірено — відповіді зафіксовано.',
  'not-learning': 'Розбір після кожної ознаки є лише в навчальній спробі.',
  'already-checked': 'Цю ознаку вже перевірено.',
  incomplete: 'Зіставте усі формулювання ознаки з моделями, перш ніж перевіряти.',
  'learning-unfinished': 'Спершу завершіть навчальну спробу — оцінюється друга.',
  'graded-started': 'Оцінювану спробу вже розпочато.',
};

const ITEM_STATE_LABELS: Readonly<Record<MatrixItemState, string>> = {
  right: 'правильно',
  wrong: 'неправильно',
  unanswered: 'без відповіді',
  answered: 'модель обрано',
};

export function itemStateLabel(state: MatrixItemState): string {
  return ITEM_STATE_LABELS[state];
}

export function matrixProgressText({ answered, total }: { readonly answered: number; readonly total: number }): string {
  return `Зіставлено ${answered} з ${total}`;
}

export function featureCheckText(featureTitle: string, right: number, total: number): string {
  return `Ознака «${featureTitle}»: правильно ${right} з ${total}.`;
}

const MARK_FORMS = { one: 'бал', few: 'бали', many: 'балів', other: 'бала' } as const;
const MARK_DECIMALS = 2;

/** «1 бал з 1», «0,5 бала з 1». */
export function marksOfText(points: number, maxPoints: number): string {
  return `${pluralUk(roundTo(points, MARK_DECIMALS), MARK_FORMS)} з ${formatNumber(roundTo(maxPoints, MARK_DECIMALS))}`;
}

function lowerFirst(text: string): string {
  return text.charAt(0).toLocaleLowerCase('uk-UA') + text.slice(1);
}

/** Підсумок оцінюваної спроби для role="status". */
export function matrixSummaryText(summary: { readonly total: number; readonly right: number }, mark: RubricMark): string {
  const share = formatPercent(summary.right / summary.total);
  return `Правильно ${summary.right} з ${summary.total} (${share}). За рубрикою — ${marksOfText(mark.points, mark.maxPoints)}: ${lowerFirst(mark.band.description)}`;
}

/** Результат, збережений у прогресі як частка: «35 з 40 (87,5 %) — 0,5 бала з 1». */
export function recordedResultText(share: number, total: number, bands: readonly RubricBand[]): string {
  const right = Math.min(total, Math.max(0, Math.round(share * total)));
  const mark = rubricMark(bands, right, total);
  return `${right} з ${total} (${formatPercent(right / total)}) — ${marksOfText(mark.points, mark.maxPoints)}`;
}
