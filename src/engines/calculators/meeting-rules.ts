import { formatNumber } from '../shared/number-format';
import { err, ok } from '../shared/result';
import { calcError, firstError, nonNegativeInteger, positiveInteger, type CalcError, type CalcResult, type FieldSpec } from './validation';

/**
 * Кворум і більшість загальних зборів. Пороги — лише з конфігурації MeetingRules; значення за
 * замовчуванням звірено з docs/research/legal-baseline.md (розділ 1, перевірено 2026-09-14),
 * Закон України «Про акціонерні товариства» № 2465-IX.
 */
export interface Threshold {
  readonly numerator: number;
  readonly denominator: number;
  /** true — «більше ніж» (більш як), false — «не менше ніж». */
  readonly strict: boolean;
}

export interface MajorityThreshold extends Threshold {
  /** registered — від зареєстрованих голосуючих акцій; total — від загальної кількості голосуючих акцій. */
  readonly base: 'registered' | 'total';
}

export type MajorityKind = 'simple' | 'qualified' | 'preemptive-waiver' | 'significant-transaction-50';

export interface MeetingRules {
  readonly quorum: Threshold;
  readonly majorities: Readonly<Record<MajorityKind, MajorityThreshold>>;
}

export const DEFAULT_MEETING_RULES: MeetingRules = Object.freeze<MeetingRules>({
  /** [AT-26] ст. 40 ч. 1: кворум — зареєструвалися власники більше 50% голосуючих акцій. */
  quorum: { numerator: 1, denominator: 2, strict: true },
  majorities: {
    /** [AT-38] ст. 53 ч. 4: загальне правило — більше 50% голосів зареєстрованих акціонерів. */
    simple: { numerator: 1, denominator: 2, strict: true, base: 'registered' },
    /** [AT-38] ст. 53 ч. 6 абз. 1: більш як 3/4 — статут, тип, структура, емісія, капітал, викуп, припинення. */
    qualified: { numerator: 3, denominator: 4, strict: true, base: 'registered' },
    /** [AT-38, AT-15] ст. 53 ч. 6 абз. 2: більше 95% — невикористання переважного права (п. 21 ч. 2 ст. 39). */
    'preemptive-waiver': { numerator: 95, denominator: 100, strict: true, base: 'registered' },
    /** [AT-62] ст. 106 ч. 3: значний правочин на 50% активів і більше — більш як 50% від загальної кількості голосів. */
    'significant-transaction-50': { numerator: 1, denominator: 2, strict: true, base: 'total' },
  },
});

const FIELDS = {
  votingShares: { field: 'votingShares', label: 'Кількість голосуючих акцій' },
  registeredShares: { field: 'registeredShares', label: 'Зареєстровані голосуючі акції' },
  votesFor: { field: 'votesFor', label: 'Голоси «за»' },
  majority: { field: 'majority', label: 'Вимога до більшості' },
  rules: { field: 'rules', label: 'Правила зборів' },
} as const satisfies Record<string, FieldSpec>;

/** Найменша ціла кількість, що задовольняє поріг: «більше» → floor(base·n/d) + 1, «не менше» → ceil(base·n/d). */
export function minimumAbove(base: number, threshold: Threshold): number {
  const scaled = base * threshold.numerator;
  return threshold.strict ? Math.floor(scaled / threshold.denominator) + 1 : Math.ceil(scaled / threshold.denominator);
}

function thresholdError(threshold: Threshold | undefined): CalcError | null {
  const valid =
    threshold !== undefined &&
    Number.isInteger(threshold.numerator) &&
    Number.isInteger(threshold.denominator) &&
    threshold.denominator > 0 &&
    threshold.numerator >= 0 &&
    threshold.numerator <= threshold.denominator;
  return valid ? null : calcError('inconsistent', FIELDS.rules, 'Поріг у правилах зборів задано некоректно: потрібен дріб від 0 до 1.');
}

interface SharesInput {
  readonly votingShares: number;
  readonly registeredShares: number;
}

function sharesError(input: SharesInput): CalcError | null {
  return (
    firstError(positiveInteger(input.votingShares, FIELDS.votingShares), nonNegativeInteger(input.registeredShares, FIELDS.registeredShares)) ??
    (input.registeredShares > input.votingShares
      ? calcError('inconsistent', FIELDS.registeredShares, 'Зареєстровано більше акцій, ніж є голосуючих акцій.')
      : null)
  );
}

export interface QuorumInput extends SharesInput {}

export interface QuorumResult {
  readonly hasQuorum: boolean;
  readonly requiredShares: number;
  readonly shortfall: number;
  /** Частка зареєстрованих у голосуючих акціях, 0..1. */
  readonly registeredShare: number;
}

/**
 * `votingShares` — голосуючі акції, що враховуються в кворумі (без викуплених товариством і акцій
 * підконтрольних йому юросіб, ст. 40 ч. 4); `registeredShares` — з них зареєстровані.
 */
export function calculateQuorum(input: QuorumInput, rules: MeetingRules = DEFAULT_MEETING_RULES): CalcResult<QuorumResult> {
  const problem = sharesError(input) ?? thresholdError(rules.quorum);
  if (problem) return err(problem);
  const requiredShares = minimumAbove(input.votingShares, rules.quorum);
  return ok({
    hasQuorum: input.registeredShares >= requiredShares,
    requiredShares,
    shortfall: Math.max(0, requiredShares - input.registeredShares),
    registeredShare: input.registeredShares / input.votingShares,
  });
}

export interface ResolutionInput extends SharesInput {
  readonly votesFor: number;
  readonly majority: MajorityKind;
}

export interface ResolutionResult {
  readonly adopted: boolean;
  readonly base: number;
  readonly requiredVotes: number;
  readonly shareOfBase: number;
  readonly threshold: MajorityThreshold;
}

export function decideResolution(input: ResolutionInput, rules: MeetingRules = DEFAULT_MEETING_RULES): CalcResult<ResolutionResult> {
  const threshold = Object.hasOwn(rules.majorities, input.majority) ? rules.majorities[input.majority] : undefined;
  if (threshold === undefined) return err(calcError('inconsistent', FIELDS.majority, 'Невідома вимога до більшості голосів.'));
  const problem =
    sharesError(input) ??
    nonNegativeInteger(input.votesFor, FIELDS.votesFor) ??
    (input.votesFor > input.registeredShares
      ? calcError('inconsistent', FIELDS.votesFor, `Голосів «за» не може бути більше, ніж зареєстровано (${formatNumber(input.registeredShares)}).`)
      : null) ??
    thresholdError(threshold);
  if (problem) return err(problem);

  const base = threshold.base === 'total' ? input.votingShares : input.registeredShares;
  const requiredVotes = minimumAbove(base, threshold);
  return ok({ adopted: input.votesFor >= requiredVotes, base, requiredVotes, shareOfBase: base > 0 ? input.votesFor / base : 0, threshold });
}
