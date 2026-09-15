import { err, ok } from '../shared/result';
import { calcError, finiteNumber, firstError, positiveNumber, type CalcResult, type FieldSpec } from './validation';

/**
 * Трифакторна модель DuPont: ROA = ROS × оборотність активів; ROE = ROA × мультиплікатор капіталу.
 * Беремо середні за період активи й власний капітал. За від’ємного власного капіталу ROE не має
 * економічного змісту — повертаємо помилку, а не «від’ємну рентабельність».
 */
export interface DupontInput {
  readonly revenue: number;
  readonly netIncome: number;
  readonly averageAssets: number;
  readonly averageEquity: number;
}

export interface DupontResult {
  readonly returnOnSales: number;
  readonly assetTurnover: number;
  readonly returnOnAssets: number;
  readonly equityMultiplier: number;
  readonly returnOnEquity: number;
}

const F = {
  revenue: { field: 'revenue', label: 'Чиста виручка' },
  netIncome: { field: 'netIncome', label: 'Чистий прибуток' },
  averageAssets: { field: 'averageAssets', label: 'Середні активи' },
  averageEquity: { field: 'averageEquity', label: 'Середній власний капітал' },
  previous: { field: 'previous', label: 'Попередній період' },
  current: { field: 'current', label: 'Поточний період' },
} as const satisfies Record<string, FieldSpec>;

export function dupontAnalysis(input: DupontInput): CalcResult<DupontResult> {
  const problem =
    firstError(
      positiveNumber(input.revenue, F.revenue),
      finiteNumber(input.netIncome, F.netIncome),
      positiveNumber(input.averageAssets, F.averageAssets),
      positiveNumber(input.averageEquity, F.averageEquity),
    ) ??
    (input.averageEquity > input.averageAssets
      ? calcError('inconsistent', F.averageEquity, 'Власний капітал не може перевищувати активи: зобов’язання не бувають від’ємними.')
      : null);
  if (problem) return err(problem);

  const returnOnSales = input.netIncome / input.revenue;
  const assetTurnover = input.revenue / input.averageAssets;
  const returnOnAssets = returnOnSales * assetTurnover;
  const equityMultiplier = input.averageAssets / input.averageEquity;
  return ok({ returnOnSales, assetTurnover, returnOnAssets, equityMultiplier, returnOnEquity: returnOnAssets * equityMultiplier });
}

export interface PeriodPair {
  readonly previous: number;
  readonly current: number;
}

export interface GrowthRates {
  readonly absoluteChange: number;
  /** Темп зростання: поточне / попереднє (1,15 = 115%). */
  readonly growthIndex: number;
  /** Темп приросту: темп зростання − 1 (0,15 = 15%). */
  readonly growthRate: number;
}

export function growthRates(pair: PeriodPair, label = 'Показник'): CalcResult<GrowthRates> {
  const problem = firstError(
    positiveNumber(pair.previous, { ...F.previous, label: `${label}: попередній період` }),
    finiteNumber(pair.current, { ...F.current, label: `${label}: поточний період` }),
  );
  if (problem) return err(problem);
  const growthIndex = pair.current / pair.previous;
  return ok({ absoluteChange: pair.current - pair.previous, growthIndex, growthRate: growthIndex - 1 });
}

export interface GrowthComparison {
  readonly revenue: GrowthRates;
  readonly cost: GrowthRates;
  readonly costGrowsFaster: boolean;
  /** Різниця темпів приросту виручки й собівартості, у відсоткових пунктах. */
  readonly gapPercentagePoints: number;
}

const PERCENT = 100;

export function compareGrowth(input: { readonly revenue: PeriodPair; readonly cost: PeriodPair }): CalcResult<GrowthComparison> {
  const revenue = growthRates(input.revenue, 'Виручка');
  if (!revenue.ok) return revenue;
  const cost = growthRates(input.cost, 'Собівартість');
  if (!cost.ok) return cost;
  return ok({
    revenue: revenue.value,
    cost: cost.value,
    costGrowsFaster: cost.value.growthRate > revenue.value.growthRate,
    gapPercentagePoints: (revenue.value.growthRate - cost.value.growthRate) * PERCENT,
  });
}
