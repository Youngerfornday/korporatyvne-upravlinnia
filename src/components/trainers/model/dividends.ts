/**
 * Тренажер «Дивіденди й чисті активи»: каскад розподілу прибутку (резерв → привілейовані → прості),
 * дивіденд на акцію, дивідендний вихід і правило чистих активів (ст. 35 ч. 1 п. 2 Закону № 2465-IX).
 * Відсотки в полях вводяться як відсотки («5», «12,5»), рушію передаються частками.
 */
import {
  distributeProfit,
  expectValid,
  generateDividendTask,
  type NetAssetsInput,
  type ProfitDistribution,
  type ProfitDistributionInput,
} from '../../../engines/calculators';
import { formatMoney, roundTo } from '../../../engines/shared/number-format';
import { pickOne, type RandomSource } from '../../../engines/shared/random';
import { err, ok, type Result } from '../../../engines/shared/result';
import { money, num, percent } from './format';
import {
  PERCENT_SCALE,
  checkChoicePart,
  checkNumberPart,
  combineParts,
  issueFromCalc,
  parseFields,
  type FieldIssues,
  type TaskCheck,
  type YesNo,
} from './task-check';

const MAIN_FIELDS = {
  netProfit: { field: 'netProfit', label: 'Чистий прибуток, грн' },
  reserveRate: { field: 'reserveRate', label: 'Відрахування до резервного капіталу, %' },
  preferredShares: { field: 'preferredShares', label: 'Кількість привілейованих акцій' },
  preferredDividendPerShare: { field: 'preferredDividendPerShare', label: 'Дивіденд на привілейовану акцію, грн' },
  commonShares: { field: 'commonShares', label: 'Кількість простих акцій' },
  commonPayoutRatio: { field: 'commonPayoutRatio', label: 'Частка прибутку на дивіденди за простими, %' },
} as const;

const REQUIRED_NET_ASSET_FIELDS = {
  equityBeforeDividends: { field: 'equityBeforeDividends', label: 'Власний капітал до виплати, грн' },
  statutoryCapital: { field: 'statutoryCapital', label: 'Статутний капітал, грн' },
} as const;

const OPTIONAL_NET_ASSET_FIELDS = {
  reserveCapitalAfter: { field: 'reserveCapitalAfter', label: 'Резервний капітал, грн' },
  preferredLiquidationExcess: { field: 'preferredLiquidationExcess', label: 'Перевищення ліквідаційної вартості привілейованих, грн' },
} as const;

export type DividendMainField = keyof typeof MAIN_FIELDS;
export type DividendNetAssetField = keyof typeof REQUIRED_NET_ASSET_FIELDS | keyof typeof OPTIONAL_NET_ASSET_FIELDS;

export interface DividendForm extends Readonly<Record<DividendMainField | DividendNetAssetField, string>> {
  readonly checkNetAssets: boolean;
}

/** Дивіденд на одну акцію — завжди до копійки: «3,00 грн». */
const perShare = (value: number): string => formatMoney(value);

export function dividendSteps(input: ProfitDistributionInput, result: ProfitDistribution): string[] {
  const steps = [
    `Резерв: ${money(input.netProfit)} × ${percent(input.reserveRate)} = ${money(result.reserve)}; залишок ${money(result.afterReserve)}.`,
    `Привілейовані: ${num(input.preferredShares)} × ${perShare(input.preferredDividendPerShare)} = ${money(input.preferredShares * input.preferredDividendPerShare)}.`,
  ];
  const common =
    result.preferredShortfall > 0
      ? [
          `Доступно лише ${money(result.preferredDividends)} — недоплата ${money(result.preferredShortfall)}; за простими акціями не платять, доки не виплачено сповна за привілейованими.`,
        ]
      : [
          `Залишок після привілейованих: ${money(result.afterReserve - result.preferredDividends)}.`,
          `Прості: ${money(result.afterReserve - result.preferredDividends)} × ${percent(input.commonPayoutRatio)} = ${money(result.commonPool)}; на акцію ${money(result.commonPool)} / ${num(input.commonShares)} = ${perShare(result.commonPerShare)}.`,
        ];
  const totals = `Усього дивідендів ${money(result.totalDividends)}; нерозподілений прибуток ${money(result.retainedEarnings)}; дивідендний вихід ${money(result.totalDividends)} / ${money(input.netProfit)} = ${percent(result.payoutRatio)}.`;
  return [...steps, ...common, totals, ...netAssetsSteps(input.netAssets, result)];
}

function netAssetsSteps(netAssets: NetAssetsInput | undefined, result: ProfitDistribution): string[] {
  const check = result.netAssetsCheck;
  if (!netAssets || !check) return [];
  const parts = [netAssets.statutoryCapital, netAssets.reserveCapitalAfter ?? 0, netAssets.preferredLiquidationExcess ?? 0];
  const verdict = check.compliant
    ? `Після виплати: ${money(netAssets.equityBeforeDividends)} − ${money(result.totalDividends)} = ${money(check.equityAfter)} ≥ ${money(check.minimumEquity)} → виплата дозволена.`
    : `Після виплати: ${money(netAssets.equityBeforeDividends)} − ${money(result.totalDividends)} = ${money(check.equityAfter)} < ${money(check.minimumEquity)} → рішення про дивіденди за простими акціями приймати не можна.`;
  return [
    `Мінімальний власний капітал: ${parts.map(money).join(' + ')} = ${money(check.minimumEquity)}.`,
    verdict,
    `Найбільша сума за простими: ${money(netAssets.equityBeforeDividends)} − ${money(result.preferredDividends)} − ${money(check.minimumEquity)} = ${money(check.maximumCommonDividends)}.`,
  ];
}

export interface DividendCalculation {
  readonly input: ProfitDistributionInput;
  readonly result: ProfitDistribution;
  readonly steps: readonly string[];
}

function parseNetAssets(form: DividendForm): Result<NetAssetsInput | undefined, FieldIssues> {
  if (!form.checkNetAssets) return ok(undefined);
  const optional = (value: string) => (value.trim() === '' ? '0' : value);
  const parsed = parseFields(
    {
      equityBeforeDividends: form.equityBeforeDividends,
      statutoryCapital: form.statutoryCapital,
      reserveCapitalAfter: optional(form.reserveCapitalAfter),
      preferredLiquidationExcess: optional(form.preferredLiquidationExcess),
    },
    { ...REQUIRED_NET_ASSET_FIELDS, ...OPTIONAL_NET_ASSET_FIELDS },
  );
  return parsed.ok ? ok(parsed.value) : parsed;
}

export function calculateDividendForm(form: DividendForm): Result<DividendCalculation, FieldIssues> {
  const main = parseFields<DividendMainField>(
    {
      netProfit: form.netProfit,
      reserveRate: form.reserveRate,
      preferredShares: form.preferredShares,
      preferredDividendPerShare: form.preferredDividendPerShare,
      commonShares: form.commonShares,
      commonPayoutRatio: form.commonPayoutRatio,
    },
    MAIN_FIELDS,
  );
  const netAssets = parseNetAssets(form);
  if (!main.ok || !netAssets.ok) return err([...(main.ok ? [] : main.error), ...(netAssets.ok ? [] : netAssets.error)]);

  const input: ProfitDistributionInput = {
    ...main.value,
    reserveRate: main.value.reserveRate / PERCENT_SCALE,
    commonPayoutRatio: main.value.commonPayoutRatio / PERCENT_SCALE,
    ...(netAssets.value ? { netAssets: netAssets.value } : {}),
  };
  const result = distributeProfit(input);
  if (!result.ok) return err([issueFromCalc(result.error)]);
  return ok({ input, result: result.value, steps: dividendSteps(input, result.value) });
}

export interface DividendVariant {
  readonly variantId: string;
  readonly input: ProfitDistributionInput;
  readonly result: ProfitDistribution;
}

const THOUSAND = 1_000;

/**
 * Варіант: розподіл — з генератора рушія; баланс для правила чистих активів добирається так, щоб після
 * виплати капітал був або на половину виплати вищим, або на половину нижчим за мінімум.
 */
export function createDividendVariant(random: RandomSource): DividendVariant {
  const task = generateDividendTask(random);
  const statutoryCapital = pickOne([5, 10, 20], random) * 1_000_000;
  const reserveCapitalAfter = task.answer.reserve + pickOne([0, 200_000, 500_000], random);
  const preferredLiquidationExcess = task.input.preferredShares * pickOne([0, 1, 2], random);
  const compliant = pickOne([true, false], random);
  const minimumEquity = statutoryCapital + reserveCapitalAfter + preferredLiquidationExcess;
  const margin = Math.max(THOUSAND, Math.round(task.answer.totalDividends / 2 / THOUSAND) * THOUSAND);
  const equityBeforeDividends = minimumEquity + task.answer.totalDividends + (compliant ? margin : -margin);
  const input = { ...task.input, netAssets: { equityBeforeDividends, statutoryCapital, reserveCapitalAfter, preferredLiquidationExcess } };
  return { variantId: `${task.variantId}-na${compliant ? 1 : 0}`, input, result: expectValid(distributeProfit(input)) };
}

export interface DividendAnswer {
  readonly commonPerShare: string;
  readonly totalDividends: string;
  readonly payoutPercent: string;
  readonly compliant: YesNo;
}

export const DIVIDEND_TASK_LABELS = {
  commonPerShare: 'Дивіденд на просту акцію, грн',
  totalDividends: 'Усього дивідендів, грн',
  payoutPercent: 'Дивідендний вихід, %',
  compliant: 'Чи дозволяє правило чистих активів виплату?',
} as const;

const MONEY_TOLERANCE = 0.005;
const SUM_TOLERANCE = 0.5;
const PERCENT_TOLERANCE = 0.05;

export function checkDividendAnswer(variant: DividendVariant, answer: DividendAnswer): Result<TaskCheck, FieldIssues> {
  const { result } = variant;
  const payoutPercent = roundTo(result.payoutRatio * PERCENT_SCALE, 4);
  return combineParts([
    checkNumberPart({ id: 'commonPerShare', label: DIVIDEND_TASK_LABELS.commonPerShare, text: answer.commonPerShare, expected: result.commonPerShare, tolerance: MONEY_TOLERANCE, format: perShare }),
    checkNumberPart({ id: 'totalDividends', label: DIVIDEND_TASK_LABELS.totalDividends, text: answer.totalDividends, expected: result.totalDividends, tolerance: SUM_TOLERANCE, format: money }),
    checkNumberPart({ id: 'payoutPercent', label: DIVIDEND_TASK_LABELS.payoutPercent, text: answer.payoutPercent, expected: payoutPercent, tolerance: PERCENT_TOLERANCE, format: (value) => percent(value / PERCENT_SCALE) }),
    checkChoicePart({ id: 'compliant', label: DIVIDEND_TASK_LABELS.compliant, value: answer.compliant, expected: result.netAssetsCheck?.compliant ?? true, yes: 'так', no: 'ні' }),
  ]);
}

export function dividendSolution(variant: DividendVariant): string[] {
  return dividendSteps(variant.input, variant.result);
}
