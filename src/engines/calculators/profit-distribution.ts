import { err, ok } from '../shared/result';
import {
  calcError,
  finiteNumber,
  firstError,
  nonNegativeInteger,
  nonNegativeNumber,
  positiveInteger,
  positiveNumber,
  share,
  type CalcError,
  type CalcResult,
  type FieldSpec,
} from './validation';

/**
 * Розподіл чистого прибутку АТ: резерв → дивіденди за привілейованими → дивіденди за простими.
 * - Резерв: відсоток відрахувань визначає статут; закон мінімуму не встановлює (ст. 16 ч. 4–5, AT-10),
 *   тому ставка — обов’язковий вхід, а не константа.
 * - Привілейовані: розмір за статутом (ст. 34 ч. 1–2); якщо їх не сплачено сповна, за простими не
 *   платять (ст. 35 ч. 2, AT-19).
 * - Правило чистих активів (ст. 35 ч. 1 п. 2, AT-19): не можна вирішувати платити за простими, якщо
 *   власний капітал менший (або стане меншим) за статутний + резервний капітал + перевищення
 *   ліквідаційної вартості привілейованих над номіналом. Складники вмикаються параметром.
 */
export interface NetAssetsRule {
  readonly includeReserveCapital: boolean;
  readonly includePreferredLiquidationExcess: boolean;
}

export const DEFAULT_NET_ASSETS_RULE: NetAssetsRule = Object.freeze({ includeReserveCapital: true, includePreferredLiquidationExcess: true });

export interface Holder {
  readonly id: string;
  readonly label: string;
  readonly commonShares: number;
  readonly preferredShares?: number;
}

export interface NetAssetsInput {
  readonly equityBeforeDividends: number;
  readonly statutoryCapital: number;
  readonly reserveCapitalAfter?: number;
  readonly preferredLiquidationExcess?: number;
}

export interface ProfitDistributionInput {
  readonly netProfit: number;
  readonly reserveRate: number;
  readonly preferredShares: number;
  readonly preferredDividendPerShare: number;
  readonly commonShares: number;
  readonly commonPayoutRatio: number;
  readonly holders?: readonly Holder[];
  readonly netAssets?: NetAssetsInput;
  readonly netAssetsRule?: NetAssetsRule;
}

export interface HolderPayout {
  readonly id: string;
  readonly label: string;
  readonly amount: number;
  readonly shareOfDividends: number;
}

export interface NetAssetsCheck {
  readonly equityAfter: number;
  readonly minimumEquity: number;
  readonly compliant: boolean;
  readonly maximumCommonDividends: number;
}

export interface ProfitDistribution {
  readonly reserve: number;
  readonly afterReserve: number;
  readonly preferredDividends: number;
  readonly preferredShortfall: number;
  readonly commonPool: number;
  readonly commonPerShare: number;
  readonly totalDividends: number;
  readonly retainedEarnings: number;
  /** Дивідендний вихід: усі дивіденди / чистий прибуток. */
  readonly payoutRatio: number;
  readonly holders: readonly HolderPayout[];
  readonly netAssetsCheck: NetAssetsCheck | null;
}

const F = {
  netProfit: { field: 'netProfit', label: 'Чистий прибуток' },
  reserveRate: { field: 'reserveRate', label: 'Відрахування до резервного капіталу' },
  preferredShares: { field: 'preferredShares', label: 'Кількість привілейованих акцій' },
  preferredDividendPerShare: { field: 'preferredDividendPerShare', label: 'Дивіденд на привілейовану акцію' },
  commonShares: { field: 'commonShares', label: 'Кількість простих акцій' },
  commonPayoutRatio: { field: 'commonPayoutRatio', label: 'Частка прибутку на дивіденди за простими' },
  holders: { field: 'holders', label: 'Акціонери' },
  equityBeforeDividends: { field: 'equityBeforeDividends', label: 'Власний капітал до виплати' },
  statutoryCapital: { field: 'statutoryCapital', label: 'Статутний капітал' },
  reserveCapitalAfter: { field: 'reserveCapitalAfter', label: 'Резервний капітал' },
  preferredLiquidationExcess: { field: 'preferredLiquidationExcess', label: 'Перевищення ліквідаційної вартості привілейованих' },
} as const satisfies Record<string, FieldSpec>;

function inputError(input: ProfitDistributionInput): CalcError | null {
  return firstError(
    positiveNumber(input.netProfit, F.netProfit),
    share(input.reserveRate, F.reserveRate),
    nonNegativeInteger(input.preferredShares, F.preferredShares),
    nonNegativeNumber(input.preferredDividendPerShare, F.preferredDividendPerShare),
    positiveInteger(input.commonShares, F.commonShares),
    share(input.commonPayoutRatio, F.commonPayoutRatio),
    holdersError(input),
    input.netAssets ? netAssetsError(input.netAssets) : null,
  );
}

function holdersError(input: ProfitDistributionInput): CalcError | null {
  const holders = input.holders ?? [];
  const invalid = holders.find(
    (holder) => nonNegativeInteger(holder.commonShares, F.holders) !== null || nonNegativeInteger(holder.preferredShares ?? 0, F.holders) !== null,
  );
  if (invalid) return calcError('not-integer', F.holders, `Кількість акцій акціонера «${invalid.label}» має бути цілим невід’ємним числом.`);
  const common = holders.reduce((acc, holder) => acc + holder.commonShares, 0);
  const preferred = holders.reduce((acc, holder) => acc + (holder.preferredShares ?? 0), 0);
  if (common > input.commonShares || preferred > input.preferredShares) {
    return calcError('inconsistent', F.holders, 'Акціонерам належить більше акцій, ніж випущено.');
  }
  return null;
}

function netAssetsError(netAssets: NetAssetsInput): CalcError | null {
  return firstError(
    finiteNumber(netAssets.equityBeforeDividends, F.equityBeforeDividends),
    nonNegativeNumber(netAssets.statutoryCapital, F.statutoryCapital),
    nonNegativeNumber(netAssets.reserveCapitalAfter ?? 0, F.reserveCapitalAfter),
    nonNegativeNumber(netAssets.preferredLiquidationExcess ?? 0, F.preferredLiquidationExcess),
  );
}

function checkNetAssets(netAssets: NetAssetsInput, rule: NetAssetsRule, preferredDividends: number, totalDividends: number): NetAssetsCheck {
  const minimumEquity =
    netAssets.statutoryCapital +
    (rule.includeReserveCapital ? (netAssets.reserveCapitalAfter ?? 0) : 0) +
    (rule.includePreferredLiquidationExcess ? (netAssets.preferredLiquidationExcess ?? 0) : 0);
  const equityAfter = netAssets.equityBeforeDividends - totalDividends;
  return {
    equityAfter,
    minimumEquity,
    compliant: equityAfter >= minimumEquity,
    maximumCommonDividends: Math.max(0, netAssets.equityBeforeDividends - preferredDividends - minimumEquity),
  };
}

export function distributeProfit(input: ProfitDistributionInput): CalcResult<ProfitDistribution> {
  const problem = inputError(input);
  if (problem) return err(problem);

  const reserve = input.netProfit * input.reserveRate;
  const afterReserve = input.netProfit - reserve;
  const preferredDue = input.preferredShares * input.preferredDividendPerShare;
  const preferredDividends = Math.min(preferredDue, afterReserve);
  const preferredShortfall = preferredDue - preferredDividends;
  const commonPool = preferredShortfall > 0 ? 0 : (afterReserve - preferredDividends) * input.commonPayoutRatio;
  const commonPerShare = commonPool / input.commonShares;
  const preferredPerSharePaid = input.preferredShares > 0 ? preferredDividends / input.preferredShares : 0;
  const totalDividends = preferredDividends + commonPool;

  const holders = (input.holders ?? []).map((holder) => {
    const amount = holder.commonShares * commonPerShare + (holder.preferredShares ?? 0) * preferredPerSharePaid;
    return { id: holder.id, label: holder.label, amount, shareOfDividends: totalDividends > 0 ? amount / totalDividends : 0 };
  });

  return ok({
    reserve,
    afterReserve,
    preferredDividends,
    preferredShortfall,
    commonPool,
    commonPerShare,
    totalDividends,
    retainedEarnings: afterReserve - totalDividends,
    payoutRatio: totalDividends / input.netProfit,
    holders,
    netAssetsCheck: input.netAssets
      ? checkNetAssets(input.netAssets, input.netAssetsRule ?? DEFAULT_NET_ASSETS_RULE, preferredDividends, totalDividends)
      : null,
  });
}
