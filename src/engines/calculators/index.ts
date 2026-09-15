/**
 * Калькулятори практичних занять. Кожна функція валідує вхід і повертає `CalcResult`: значення або
 * типізовану помилку українською (ніколи NaN чи Infinity). Числа для показу — `shared/number-format`.
 */
export { cumulativeVotes, guaranteedSeats, minimumStakeForSeats } from './cumulative-voting';
export type { GuaranteedSeatsInput, MinimumStakeInput, MinimumStakeResult } from './cumulative-voting';
export { compareGrowth, dupontAnalysis, growthRates } from './dupont';
export type { DupontInput, DupontResult, GrowthComparison, GrowthRates, PeriodPair } from './dupont';
export { generateBondTask, generateCumulativeTask, generateDividendTask, generateDupontTask, generateQuorumTask } from './generators';
export type { BondTaskInput, GeneratedTask } from './generators';
export { DEFAULT_MEETING_RULES, calculateQuorum, decideResolution, minimumAbove } from './meeting-rules';
export type { MajorityKind, MajorityThreshold, MeetingRules, QuorumInput, QuorumResult, ResolutionInput, ResolutionResult, Threshold } from './meeting-rules';
export { DEFAULT_NET_ASSETS_RULE, distributeProfit } from './profit-distribution';
export type { Holder, HolderPayout, NetAssetsCheck, NetAssetsInput, NetAssetsRule, ProfitDistribution, ProfitDistributionInput } from './profit-distribution';
export { bondPrice, currentYield, discountYield, dividendYield, earningsPerShare, priceToEarnings, yieldToMaturity } from './securities';
export type { BondTerms, DiscountYield, YieldToMaturity, YieldToMaturityOptions } from './securities';
export { MAX_COUNT, expectValid, parseCalculatorInput } from './validation';
export type { CalcError, CalcErrorCode, CalcResult, FieldSpec } from './validation';
export { formatMoney, formatNumber, formatPercent, roundTo } from '../shared/number-format';
