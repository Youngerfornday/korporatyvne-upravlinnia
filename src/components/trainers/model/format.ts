/** Форматування чисел для розбору формул: «10 000», «5 000,5», «32,50 грн», «41 %». */
import { formatMoney, formatNumber, formatPercent, roundTo } from '../../../engines/shared/number-format';
import { pluralUk } from '../../../lib/plural';

const NBSP = '\u00A0';
const MONEY_DIGITS = 2;

export const num = (value: number): string => formatNumber(value, { maximumFractionDigits: 3 });

/** Суми: цілі — без копійок («2 000 000 грн»), дробові — до копійки («32,50 грн»). */
export function money(value: number): string {
  const rounded = roundTo(value, MONEY_DIGITS);
  return Number.isInteger(rounded) ? `${formatNumber(rounded)}${NBSP}грн` : formatMoney(rounded);
}

export const percent = (ratio: number): string => formatPercent(ratio, 2);

const SHARE_FORMS = { one: 'акція', few: 'акції', many: 'акцій', other: 'акції' } as const;
const pluralRules = new Intl.PluralRules('uk');

export function sharesText(count: number): string {
  return pluralUk(count, SHARE_FORMS);
}

/** Лише слово в потрібній формі — коли число виділено окремо: «601» + «акція». */
export function sharesWord(count: number): string {
  const category = pluralRules.select(count);
  return category === 'one' || category === 'few' || category === 'many' ? SHARE_FORMS[category] : SHARE_FORMS.other;
}

/** Родовий відмінок після «бракує», «потрібно»: «1 акції», «5 акцій». */
export function sharesGenitiveText(count: number): string {
  return pluralUk(count, { one: 'акції', few: 'акцій', many: 'акцій', other: 'акції' });
}

export function seatsText(count: number): string {
  return pluralUk(count, { one: 'місце', few: 'місця', many: 'місць', other: 'місця' });
}

/** Родовий відмінок: «для 1 місця», «для 2 місць». */
export function seatsGenitiveText(count: number): string {
  return pluralUk(count, { one: 'місця', few: 'місць', many: 'місць', other: 'місця' });
}

export function votesText(count: number): string {
  return pluralUk(count, { one: 'голос', few: 'голоси', many: 'голосів', other: 'голосу' });
}
