/**
 * Тренажер «Вибір форми бізнесу»: задача на динаміку ЄДРПОУ — розбір відповіді студента і покроковий
 * розв’язок. Числа рахує рушій (`engines/legal-form`), тут лише формати, підписи й перевірка.
 */
import {
  createDynamicsVariant,
  type DynamicsVariant,
  type RegistryChange,
  type RegistrySeriesDefinition,
} from '../../../engines/legal-form';
import { roundTo } from '../../../engines/shared/number-format';
import type { RandomSource } from '../../../engines/shared/random';
import type { Result } from '../../../engines/shared/result';
import { formatDate } from '../../../lib/course-data-pure';
import { num, percent } from './format';
import { checkChoicePart, checkNumberPart, combineParts, type FieldIssues, type TaskCheck, type YesNo } from './task-check';

const PERCENT_SCALE = 100;
const PERCENT_DIGITS = 2;
/** Допуск у відсоткових пунктах: відповідь, округлена до сотих, зараховується. */
const RATE_TOLERANCE = 0.01;

export const DYNAMICS_TASK_LABELS = {
  absoluteChange: 'Абсолютна зміна, одиниць',
  growthRate: 'Темп приросту, %',
  splitComparable: 'Чи можна порівняти поділ на ПАТ і ПрАТ між цими таблицями?',
} as const;

export interface DynamicsAnswer {
  readonly absoluteChange: string;
  readonly growthRate: string;
  readonly splitComparable: YesNo;
}

export const EMPTY_DYNAMICS_ANSWER: DynamicsAnswer = { absoluteChange: '', growthRate: '', splitComparable: '' };

export function createLegalFormVariant(series: RegistrySeriesDefinition): (random: RandomSource) => DynamicsVariant {
  return (random) => createDynamicsVariant(random, series);
}

/** Темп у відсоткових пунктах: 0,240608 → 24,06. */
export function ratePercent(rate: number): number {
  return roundTo(rate * PERCENT_SCALE, PERCENT_DIGITS + 4);
}

/** Типографський мінус замість дефіса: «−451». Парсер полів його розуміє (`shared/decimal-input`). */
const MINUS = '−';
const withMinus = (text: string): string => text.replace(/^-/, MINUS);

const signed = (value: number): string => withMinus(value > 0 ? `+${num(value)}` : num(value));
const signedPercent = (rate: number): string => withMinus(rate > 0 ? `+${percent(rate)}` : percent(rate));
const ratePart = (value: number): string => withMinus(`${num(roundTo(value, PERCENT_DIGITS))} %`);

export function checkDynamicsAnswer(variant: DynamicsVariant, answer: DynamicsAnswer): Result<TaskCheck, FieldIssues> {
  const { change } = variant;
  return combineParts([
    checkNumberPart({
      id: 'absoluteChange',
      label: DYNAMICS_TASK_LABELS.absoluteChange,
      text: answer.absoluteChange,
      expected: change.rates.absoluteChange,
      tolerance: 0,
      format: signed,
    }),
    checkNumberPart({
      id: 'growthRate',
      label: DYNAMICS_TASK_LABELS.growthRate,
      text: answer.growthRate,
      expected: ratePercent(change.rates.growthRate),
      tolerance: RATE_TOLERANCE,
      format: ratePart,
    }),
    checkChoicePart({
      id: 'splitComparable',
      label: DYNAMICS_TASK_LABELS.splitComparable,
      value: answer.splitComparable,
      expected: change.splitComparable,
      yes: 'так',
      no: 'ні',
    }),
  ]);
}

/** Одне речення про напрям тренду — для фабули й підсумку. */
export function trendText(change: RegistryChange): string {
  if (change.rates.absoluteChange === 0) return 'кількість не змінилася';
  return change.rates.absoluteChange > 0 ? 'кількість зросла' : 'кількість зменшилася';
}

const COMPARABLE_STEP =
  'Обидві дати — з таблиць одного покоління, тому поділ на публічні й приватні АТ у них побудовано однаково і його можна порівнювати.';
const INCOMPARABLE_STEP =
  'Дати належать до таблиць різних поколінь: до 2021 р. включно рядки називаються «публічне / приватне акціонерне товариство», з 2022 р. — «Відкрите / Закрите акціонерне товариство». Порівнювати поділ між ними не можна, порівнюється лише загальна кількість АТ.';

export function dynamicsSolution(variant: DynamicsVariant): string[] {
  const { change } = variant;
  const rate = change.rates.growthRate;
  return [
    `${change.formTitle}: на ${formatDate(change.from.date)} — ${num(change.previous)}, на ${formatDate(change.to.date)} — ${num(change.current)} (ЄДРПОУ Держстату).`,
    `Абсолютна зміна: ${num(change.current)} ${MINUS} ${num(change.previous)} = ${signed(change.rates.absoluteChange)}.`,
    `Темп зростання: ${num(change.current)} / ${num(change.previous)} = ${percent(change.rates.growthIndex)}.`,
    `Темп приросту: ${percent(change.rates.growthIndex)} ${MINUS} 100 % = ${signedPercent(rate)}, тобто ${trendText(change)}.`,
    change.splitComparable ? COMPARABLE_STEP : INCOMPARABLE_STEP,
  ];
}
