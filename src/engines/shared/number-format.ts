/** Єдиний хелпер форматування чисел рушіїв: `Intl.NumberFormat('uk-UA')`, «1 234,5». */

const NBSP = '\u00A0';
const LOCALE = 'uk-UA';
const DEFAULT_FRACTION_DIGITS = 2;
/** Значущих цифр для «попереднього округлення», як у PHP round(): прибирає артефакти 1.005 * 100. */
const PRE_ROUNDING_DIGITS = 15;

export interface NumberFormatOptions {
  readonly minimumFractionDigits?: number;
  readonly maximumFractionDigits?: number;
}

const formatters = new Map<string, Intl.NumberFormat>();

function formatter(options: NumberFormatOptions): Intl.NumberFormat {
  const key = `${options.minimumFractionDigits ?? ''}:${options.maximumFractionDigits ?? ''}`;
  const cached = formatters.get(key);
  if (cached) return cached;
  const created = new Intl.NumberFormat(LOCALE, options);
  formatters.set(key, created);
  return created;
}

export function formatNumber(value: number, options: NumberFormatOptions = { maximumFractionDigits: 10 }): string {
  return formatter(options).format(value);
}

/** «32,50 грн». */
export function formatMoney(value: number): string {
  const digits = { minimumFractionDigits: DEFAULT_FRACTION_DIGITS, maximumFractionDigits: DEFAULT_FRACTION_DIGITS };
  return `${formatNumber(value, digits)}${NBSP}грн`;
}

/** Частка → відсотки: 0.125 → «12,5 %» (за українською типографікою знак відділено нерозривним пробілом). */
export function formatPercent(ratio: number, maximumFractionDigits = DEFAULT_FRACTION_DIGITS): string {
  return `${formatNumber(roundTo(ratio * 100, maximumFractionDigits), { maximumFractionDigits })}${NBSP}%`;
}

/** Округлення «від нуля» до `digits` знаків (від’ємні — до десятків, сотень…), як PHP round(). */
export function roundTo(value: number, digits: number): number {
  const scale = 10 ** Math.abs(digits);
  const scaled = digits >= 0 ? value * scale : value / scale;
  const cleaned = Number(Math.abs(scaled).toPrecision(PRE_ROUNDING_DIGITS));
  const rounded = Math.sign(scaled) * Math.round(cleaned);
  return digits >= 0 ? rounded / scale : rounded * scale;
}
