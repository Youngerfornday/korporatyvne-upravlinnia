import { parseDecimalInput } from '../shared/decimal-input';
import { formatNumber } from '../shared/number-format';
import { err, ok, type Result } from '../shared/result';

/** Типізована помилка калькулятора: код для логіки, поле для підсвічування, повідомлення українською. */
export type CalcErrorCode =
  | 'not-finite'
  | 'negative'
  | 'not-positive'
  | 'not-integer'
  | 'out-of-range'
  | 'inconsistent'
  | 'undefined-ratio'
  | 'no-convergence';

export interface CalcError {
  readonly code: CalcErrorCode;
  readonly field: string;
  readonly message: string;
}

export type CalcResult<T> = Result<T, CalcError>;

export interface FieldSpec {
  /** Технічна назва поля (ключ вхідного об’єкта). */
  readonly field: string;
  /** Назва поля для людини. */
  readonly label: string;
}

/** Верхня межа кількостей акцій: добуток на 100 лишається точним цілим у double. */
export const MAX_COUNT = 1e12;

export function calcError(code: CalcErrorCode, spec: FieldSpec, message: string): CalcError {
  return { code, field: spec.field, message };
}

export function finiteNumber(value: number, spec: FieldSpec): CalcError | null {
  return Number.isFinite(value) ? null : calcError('not-finite', spec, `Поле «${spec.label}» має бути числом.`);
}

export function nonNegativeNumber(value: number, spec: FieldSpec): CalcError | null {
  return finiteNumber(value, spec) ?? (value < 0 ? calcError('negative', spec, `Поле «${spec.label}» не може бути від’ємним.`) : null);
}

export function positiveNumber(value: number, spec: FieldSpec): CalcError | null {
  return finiteNumber(value, spec) ?? (value > 0 ? null : calcError('not-positive', spec, `Поле «${spec.label}» має бути більшим за нуль.`));
}

function integerWithin(value: number, spec: FieldSpec): CalcError | null {
  if (!Number.isInteger(value)) return calcError('not-integer', spec, `Поле «${spec.label}» має бути цілим числом.`);
  if (value > MAX_COUNT) return calcError('out-of-range', spec, `Поле «${spec.label}» не може перевищувати ${formatNumber(MAX_COUNT)}.`);
  return null;
}

export function nonNegativeInteger(value: number, spec: FieldSpec): CalcError | null {
  return nonNegativeNumber(value, spec) ?? integerWithin(value, spec);
}

export function positiveInteger(value: number, spec: FieldSpec): CalcError | null {
  return finiteNumber(value, spec) ?? integerWithin(value, spec) ?? positiveNumber(value, spec);
}

/** Частка від 0 до 1 включно (ставка відрахувань, дивідендний вихід). */
export function share(value: number, spec: FieldSpec): CalcError | null {
  return (
    finiteNumber(value, spec) ??
    (value >= 0 && value <= 1 ? null : calcError('out-of-range', spec, `Поле «${spec.label}» має бути від 0 до 100%.`))
  );
}

export function firstError(...errors: readonly (CalcError | null)[]): CalcError | null {
  return errors.find((error) => error !== null) ?? null;
}

/** Значення результату, про який відомо, що він успішний (генератори будують лише валідні входи). */
export function expectValid<T>(result: CalcResult<T>): T {
  if (!result.ok) throw new Error(`Некоректні дані задачі: ${result.error.message}`);
  return result.value;
}

/** Розбір тексту з поля калькулятора: «1 250,5» і «1250.5». */
export function parseCalculatorInput(text: string, spec: FieldSpec): CalcResult<number> {
  const value = parseDecimalInput(text);
  if (value === null) return err(calcError('not-finite', spec, `Поле «${spec.label}» має бути числом, наприклад 1,5.`));
  return ok(value);
}
