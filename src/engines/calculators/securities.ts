import { err, ok } from '../shared/result';
import {
  calcError,
  finiteNumber,
  firstError,
  nonNegativeNumber,
  positiveInteger,
  positiveNumber,
  type CalcError,
  type CalcResult,
  type FieldSpec,
} from './validation';

/** Показники цінних паперів: EPS, P/E, дивідендна доходність, облігації, дисконтні папери. */
const F = {
  netIncome: { field: 'netIncome', label: 'Чистий прибуток' },
  preferredDividends: { field: 'preferredDividends', label: 'Дивіденди за привілейованими акціями' },
  weightedCommonShares: { field: 'weightedCommonShares', label: 'Середньозважена кількість простих акцій' },
  price: { field: 'price', label: 'Ціна' },
  eps: { field: 'eps', label: 'Прибуток на акцію' },
  dividendPerShare: { field: 'dividendPerShare', label: 'Дивіденд на акцію' },
  faceValue: { field: 'faceValue', label: 'Номінал' },
  couponRate: { field: 'couponRate', label: 'Купонна ставка' },
  yearsToMaturity: { field: 'yearsToMaturity', label: 'Років до погашення' },
  marketRate: { field: 'marketRate', label: 'Ринкова ставка' },
  periodsPerYear: { field: 'periodsPerYear', label: 'Виплат купона на рік' },
  daysToMaturity: { field: 'daysToMaturity', label: 'Днів до погашення' },
  daysInYear: { field: 'daysInYear', label: 'Днів у році' },
  maxIterations: { field: 'maxIterations', label: 'Межа ітерацій' },
} as const satisfies Record<string, FieldSpec>;

const COUPON_FREQUENCIES = [1, 2, 4, 12];

export function earningsPerShare(input: {
  readonly netIncome: number;
  readonly preferredDividends?: number;
  readonly weightedCommonShares: number;
}): CalcResult<number> {
  const preferred = input.preferredDividends ?? 0;
  const problem = firstError(
    finiteNumber(input.netIncome, F.netIncome),
    nonNegativeNumber(preferred, F.preferredDividends),
    positiveNumber(input.weightedCommonShares, F.weightedCommonShares),
  );
  return problem ? err(problem) : ok((input.netIncome - preferred) / input.weightedCommonShares);
}

export function priceToEarnings(input: { readonly price: number; readonly eps: number }): CalcResult<number> {
  const problem = firstError(positiveNumber(input.price, F.price), finiteNumber(input.eps, F.eps));
  if (problem) return err(problem);
  if (input.eps <= 0) return err(calcError('undefined-ratio', F.eps, 'P/E не визначається, якщо прибуток на акцію нульовий або від’ємний.'));
  return ok(input.price / input.eps);
}

export function dividendYield(input: { readonly dividendPerShare: number; readonly price: number }): CalcResult<number> {
  const problem = firstError(nonNegativeNumber(input.dividendPerShare, F.dividendPerShare), positiveNumber(input.price, F.price));
  return problem ? err(problem) : ok(input.dividendPerShare / input.price);
}

export interface BondTerms {
  readonly faceValue: number;
  readonly couponRate: number;
  readonly yearsToMaturity: number;
  readonly periodsPerYear?: number;
}

function termsError(terms: BondTerms): CalcError | null {
  const frequency = terms.periodsPerYear ?? 1;
  return (
    firstError(
      positiveNumber(terms.faceValue, F.faceValue),
      nonNegativeNumber(terms.couponRate, F.couponRate),
      positiveNumber(terms.yearsToMaturity, F.yearsToMaturity),
    ) ??
    (COUPON_FREQUENCIES.includes(frequency)
      ? null
      : calcError('out-of-range', F.periodsPerYear, 'Купон виплачується 1, 2, 4 або 12 разів на рік.')) ??
    (Number.isInteger(terms.yearsToMaturity * frequency)
      ? null
      : calcError('not-integer', F.yearsToMaturity, 'Строк до погашення має містити цілу кількість купонних періодів.'))
  );
}

/** Ціна за періодичною ставкою: Σ C/(1+i)^t + F/(1+i)^n. */
function priceAtPeriodicRate(terms: BondTerms, periodicRate: number): number {
  const frequency = terms.periodsPerYear ?? 1;
  const periods = Math.round(terms.yearsToMaturity * frequency);
  const coupon = (terms.faceValue * terms.couponRate) / frequency;
  if (periodicRate === 0) return coupon * periods + terms.faceValue;
  const annuity = (1 - (1 + periodicRate) ** -periods) / periodicRate;
  return coupon * annuity + terms.faceValue * (1 + periodicRate) ** -periods;
}

export function bondPrice(input: BondTerms & { readonly marketRate: number }): CalcResult<number> {
  const frequency = input.periodsPerYear ?? 1;
  const problem =
    termsError(input) ??
    finiteNumber(input.marketRate, F.marketRate) ??
    (input.marketRate / frequency > -1 ? null : calcError('out-of-range', F.marketRate, 'Ринкова ставка за період має бути більшою за −100%.'));
  return problem ? err(problem) : ok(priceAtPeriodicRate(input, input.marketRate / frequency));
}

export function currentYield(input: { readonly faceValue: number; readonly couponRate: number; readonly price: number }): CalcResult<number> {
  const problem = firstError(
    positiveNumber(input.faceValue, F.faceValue),
    nonNegativeNumber(input.couponRate, F.couponRate),
    positiveNumber(input.price, F.price),
  );
  return problem ? err(problem) : ok((input.faceValue * input.couponRate) / input.price);
}

export interface YieldToMaturityOptions {
  readonly maxIterations?: number;
  /** Точність ставки за період. */
  readonly tolerance?: number;
}

export interface YieldToMaturity {
  /** Номінальна річна доходність: ставка за період × кількість періодів на рік. */
  readonly annualYield: number;
  readonly periodicYield: number;
  readonly iterations: number;
}

const DEFAULT_MAX_ITERATIONS = 200;
const DEFAULT_TOLERANCE = 1e-12;
const LOWEST_PERIODIC_RATE = -0.99;
const HIGHEST_PERIODIC_RATE = 1e6;

function noConvergence(message: string): CalcError {
  return calcError('no-convergence', F.price, message);
}

/**
 * Доходність до погашення методом бісекції: ціна облігації строго спадає зі ставкою, тож корінь
 * єдиний. Кількість ітерацій обмежено; якщо точності не досягнуто — типізована помилка.
 */
export function yieldToMaturity(input: BondTerms & { readonly price: number }, options: YieldToMaturityOptions = {}): CalcResult<YieldToMaturity> {
  const maxIterations = options.maxIterations ?? DEFAULT_MAX_ITERATIONS;
  const tolerance = options.tolerance ?? DEFAULT_TOLERANCE;
  const problem = termsError(input) ?? positiveNumber(input.price, F.price) ?? positiveInteger(maxIterations, F.maxIterations);
  if (problem) return err(problem);

  let low = LOWEST_PERIODIC_RATE;
  let high = 1;
  while (priceAtPeriodicRate(input, high) > input.price && high < HIGHEST_PERIODIC_RATE) high *= 2;
  if (priceAtPeriodicRate(input, low) < input.price || priceAtPeriodicRate(input, high) > input.price) {
    return err(noConvergence('Для такої ціни не існує реалістичної доходності до погашення. Перевірте ціну й умови облігації.'));
  }

  for (let iteration = 1; iteration <= maxIterations; iteration += 1) {
    const middle = (low + high) / 2;
    if (priceAtPeriodicRate(input, middle) > input.price) low = middle;
    else high = middle;
    if ((high - low) / 2 < tolerance) {
      const periodicYield = (low + high) / 2;
      return ok({ periodicYield, annualYield: periodicYield * (input.periodsPerYear ?? 1), iterations: iteration });
    }
  }
  return err(noConvergence(`Доходність не визначено за ${maxIterations} ітерацій. Збільште межу ітерацій або перевірте дані.`));
}

export interface DiscountYield {
  /** Дисконтна ставка до номіналу: (F − P)/F × днів у році / днів до погашення. */
  readonly discountRate: number;
  /** Доходність інвестора до ціни купівлі: (F − P)/P × днів у році / днів до погашення. */
  readonly investmentYield: number;
}

export function discountYield(input: {
  readonly faceValue: number;
  readonly price: number;
  readonly daysToMaturity: number;
  readonly daysInYear?: number;
}): CalcResult<DiscountYield> {
  const daysInYear = input.daysInYear ?? 365;
  const problem =
    firstError(
      positiveNumber(input.faceValue, F.faceValue),
      positiveNumber(input.price, F.price),
      positiveInteger(input.daysToMaturity, F.daysToMaturity),
      positiveInteger(daysInYear, F.daysInYear),
    ) ??
    (input.price > input.faceValue ? calcError('inconsistent', F.price, 'Ціна дисконтного цінного папера не може перевищувати номінал.') : null);
  if (problem) return err(problem);

  const discount = input.faceValue - input.price;
  const annualisation = daysInYear / input.daysToMaturity;
  return ok({ discountRate: (discount / input.faceValue) * annualisation, investmentYield: (discount / input.price) * annualisation });
}
