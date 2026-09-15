import { pickOne, randomInt, type RandomSource } from '../shared/random';
import { minimumStakeForSeats, type MinimumStakeInput, type MinimumStakeResult } from './cumulative-voting';
import { dupontAnalysis, type DupontInput, type DupontResult } from './dupont';
import { calculateQuorum, type QuorumInput, type QuorumResult } from './meeting-rules';
import { distributeProfit, type ProfitDistribution, type ProfitDistributionInput } from './profit-distribution';
import { bondPrice, currentYield } from './securities';
import { expectValid as unwrap } from './validation';

/**
 * Генератори варіантів задач для тренажерів: випадкові (через seeded RNG), але «красиві» числа —
 * круглі пакети, цілі відсотки, суми до копійки. Відповідь завжди рахує той самий калькулятор.
 * `variantId` придатний для `trainer-completed.variantId` (різні сценарії для бейджів).
 */
export interface GeneratedTask<I, A> {
  readonly variantId: string;
  readonly input: I;
  readonly answer: A;
}

const PERCENT = 100;

const percentId = (ratio: number) => String(Math.round(ratio * PERCENT));

export function generateQuorumTask(random: RandomSource): GeneratedTask<QuorumInput, QuorumResult> {
  const votingShares = pickOne([1_000, 2_000, 5_000, 10_000, 20_000, 50_000, 100_000, 120_000], random);
  const percent = randomInt(random, 35, 75);
  const input = { votingShares, registeredShares: (votingShares * percent) / PERCENT };
  return { variantId: `quorum-${votingShares}-${percent}`, input, answer: unwrap(calculateQuorum(input)) };
}

export function generateCumulativeTask(random: RandomSource): GeneratedTask<MinimumStakeInput, MinimumStakeResult> {
  const seats = pickOne([3, 5, 7, 9, 11], random);
  const targetSeats = randomInt(random, 1, Math.min(3, seats));
  const quota = randomInt(random, 2, 50) * 10;
  const input = { votingShares: quota * (seats + 1), seats, targetSeats };
  return { variantId: `cumulative-${input.votingShares}-${seats}-${targetSeats}`, input, answer: unwrap(minimumStakeForSeats(input)) };
}

export function generateDividendTask(random: RandomSource): GeneratedTask<ProfitDistributionInput, ProfitDistribution> {
  const netProfit = randomInt(random, 1, 20) * 1_000_000;
  const reserveRate = pickOne([0.05, 0.1, 0.2], random);
  const preferredShares = randomInt(random, 0, 5) * 10_000;
  const preferredDividendPerShare = pickOne([1, 2, 5], random);
  const commonPayoutRatio = pickOne([0.3, 0.4, 0.5, 0.6], random);
  const commonShares = pickOne([10_000, 20_000, 25_000, 50_000, 100_000], random);
  const input = { netProfit, reserveRate, preferredShares, preferredDividendPerShare, commonShares, commonPayoutRatio };
  const variantId = ['dividends', netProfit / 1_000_000, percentId(reserveRate), preferredShares, preferredDividendPerShare, percentId(commonPayoutRatio), commonShares].join('-');
  return { variantId, input, answer: unwrap(distributeProfit(input)) };
}

export function generateDupontTask(random: RandomSource): GeneratedTask<DupontInput, DupontResult> {
  const revenue = randomInt(random, 10, 90) * 1_000_000;
  const returnOnSales = pickOne([0.04, 0.05, 0.06, 0.08, 0.1, 0.12], random);
  const assetTurnover = pickOne([0.5, 0.8, 1, 1.25, 2, 2.5], random);
  const equityMultiplier = pickOne([1.25, 2, 2.5, 4, 5], random);
  const averageAssets = Math.round(revenue / assetTurnover);
  const input = {
    revenue,
    netIncome: Math.round(revenue * returnOnSales),
    averageAssets,
    averageEquity: Math.round(averageAssets / equityMultiplier),
  };
  const variantId = `dupont-${revenue / 1_000_000}-${percentId(returnOnSales)}-${percentId(assetTurnover)}-${percentId(equityMultiplier)}`;
  return { variantId, input, answer: unwrap(dupontAnalysis(input)) };
}

export interface BondTaskInput {
  readonly faceValue: number;
  readonly couponRate: number;
  readonly yearsToMaturity: number;
  readonly marketRate: number;
  readonly periodsPerYear: number;
}

export function generateBondTask(random: RandomSource): GeneratedTask<BondTaskInput, { readonly price: number; readonly currentYield: number }> {
  const input = {
    faceValue: 1_000,
    couponRate: randomInt(random, 5, 15) / PERCENT,
    yearsToMaturity: randomInt(random, 1, 5),
    marketRate: randomInt(random, 6, 18) / PERCENT,
    periodsPerYear: pickOne([1, 2], random),
  };
  const price = unwrap(bondPrice(input));
  const variantId = `bond-${percentId(input.couponRate)}-${input.yearsToMaturity}-${percentId(input.marketRate)}-${input.periodsPerYear}`;
  return { variantId, input, answer: { price, currentYield: unwrap(currentYield({ ...input, price })) } };
}
