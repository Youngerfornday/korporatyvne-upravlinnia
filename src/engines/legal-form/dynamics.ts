/**
 * Динаміка кількості юридичних осіб за формами (ЄДРПОУ Держстату): абсолютна зміна, темп зростання
 * і темп приросту між двома датами, а також перевірка, чи можна порівнювати поділ на ПАТ і ПрАТ.
 * Самі числа приходять з даних практичної; темпи рахує `growthRates` рушія калькуляторів.
 */
import { growthRates, type GrowthRates } from '../calculators/dupont';
import { calcError, type CalcResult, type FieldSpec } from '../calculators/validation';
import { pickOne, randomInt, type RandomSource } from '../shared/random';
import { err, ok } from '../shared/result';
import type { RegistryFormDefinition, RegistryPointDefinition, RegistrySeriesDefinition } from './types';

const SERIES_FIELD: FieldSpec = { field: 'series', label: 'Ряд ЄДРПОУ' };

export interface RegistryChange {
  readonly formKey: string;
  readonly formTitle: string;
  readonly from: RegistryPointDefinition;
  readonly to: RegistryPointDefinition;
  readonly previous: number;
  readonly current: number;
  readonly rates: GrowthRates;
  /**
   * Чи можна порівнювати поділ на ПАТ і ПрАТ між цими датами: лише в межах одного покоління таблиці
   * ЄДРПОУ. Загальна кількість АТ порівнюється завжди — саме тому в задачі беруть суму рядків.
   */
  readonly splitComparable: boolean;
}

function pointAt(series: RegistrySeriesDefinition, date: string): RegistryPointDefinition | undefined {
  return series.points.find((point) => point.date === date);
}

export function registryForm(series: RegistrySeriesDefinition, formKey: string): RegistryFormDefinition | undefined {
  return series.forms.find((form) => form.key === formKey);
}

/** Зміна показника між двома датами ряду. Дати мають бути в ряду, а `from` — раніше за `to`. */
export function registryChange(series: RegistrySeriesDefinition, formKey: string, fromDate: string, toDate: string): CalcResult<RegistryChange> {
  const form = registryForm(series, formKey);
  if (!form) return err(calcError('inconsistent', SERIES_FIELD, `У ряді немає форми «${formKey}».`));
  const from = pointAt(series, fromDate);
  const to = pointAt(series, toDate);
  if (!from || !to) return err(calcError('inconsistent', SERIES_FIELD, `У ряді немає дати ${from ? toDate : fromDate}.`));
  if (from.date >= to.date) return err(calcError('inconsistent', SERIES_FIELD, 'Перша дата має бути раніша за другу.'));
  const previous = from.values[formKey];
  const current = to.values[formKey];
  if (previous === undefined || current === undefined) {
    return err(calcError('inconsistent', SERIES_FIELD, `Для форми «${form.title}» немає числа на одну з дат.`));
  }
  const rates = growthRates({ previous, current }, form.title);
  if (!rates.ok) return rates;
  return ok({ formKey, formTitle: form.title, from, to, previous, current, rates: rates.value, splitComparable: from.generation === to.generation });
}

export interface DynamicsVariant {
  readonly variantId: string;
  readonly change: RegistryChange;
}

const DATE_DIGITS = /-/g;

/** ID варіанта для XP: лише малі літери, цифри й дефіси (вимога `validateLearningEvent`). */
export function dynamicsVariantId(formKey: string, fromDate: string, toDate: string): string {
  return `dynamics-${formKey}-${fromDate.replace(DATE_DIGITS, '')}-${toDate.replace(DATE_DIGITS, '')}`;
}

/**
 * Варіант задачі: форма і дві дати з ряду. Пара дат навмисно буває і в межах одного покоління таблиці,
 * і через межу 2022 р. — питання про порівнянність ПАТ/ПрАТ має різні відповіді.
 */
export function createDynamicsVariant(random: RandomSource, series: RegistrySeriesDefinition): DynamicsVariant {
  const dates = series.points.map((point) => point.date).sort();
  if (dates.length < 2) throw new Error('Ряд ЄДРПОУ має містити щонайменше дві дати');
  const fromIndex = randomInt(random, 0, dates.length - 2);
  const toIndex = randomInt(random, fromIndex + 1, dates.length - 1);
  const formKey = pickOne(
    series.forms.map((form) => form.key),
    random,
  );
  const fromDate = dates[fromIndex] as string;
  const toDate = dates[toIndex] as string;
  const change = registryChange(series, formKey, fromDate, toDate);
  if (!change.ok) throw new Error(`Некоректні дані ряду: ${change.error.message}`);
  return { variantId: dynamicsVariantId(formKey, fromDate, toDate), change: change.value };
}
