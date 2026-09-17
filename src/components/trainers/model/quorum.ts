/**
 * Тренажер «Кворум і голосування»: розбір полів, покрокові формули з числами, варіант задачі за мотивами
 * кейсу «Зоря» і перевірка відповіді. Пороги — лише з `MeetingRules` рушія (за замовчуванням Закон № 2465-IX).
 */
import {
  DEFAULT_MEETING_RULES,
  calculateQuorum,
  decideResolution,
  expectValid,
  generateQuorumTask,
  type MajorityKind,
  type MeetingRules,
  type QuorumInput,
  type QuorumResult,
  type ResolutionInput,
  type ResolutionResult,
  type Threshold,
} from '../../../engines/calculators';
import { pickOne, type RandomSource } from '../../../engines/shared/random';
import { err, ok, type Result } from '../../../engines/shared/result';
import { num, percent, sharesGenitiveText } from './format';
import { checkChoicePart, checkNumberPart, combineParts, issueFromCalc, parseFields, type FieldIssues, type TaskCheck, type YesNo } from './task-check';

export const MAJORITY_KINDS: readonly MajorityKind[] = ['simple', 'qualified', 'preemptive-waiver', 'significant-transaction-50'];

/** Питання порядку денного, для якого діє кожна вимога до більшості (legal-baseline AT-38, AT-62). */
export const MAJORITY_ISSUES: Readonly<Record<MajorityKind, string>> = {
  simple: 'затвердження річного звіту товариства',
  qualified: 'внесення змін до статуту',
  'preemptive-waiver': 'невикористання переважного права під час нової емісії акцій',
  'significant-transaction-50': 'значний правочин на 60\u00A0% вартості активів',
};

const QUORUM_FIELDS = {
  votingShares: { field: 'votingShares', label: 'Кількість голосуючих акцій' },
  registeredShares: { field: 'registeredShares', label: 'Зареєстровані голосуючі акції' },
  votesFor: { field: 'votesFor', label: 'Голоси «за»' },
} as const;

/** «більше 50 %» / «не менше 60 %». */
export function thresholdText(threshold: Threshold): string {
  return `${threshold.strict ? 'більше' : 'не менше'} ${percent(threshold.numerator / threshold.denominator)}`;
}

export function majorityLabel(kind: MajorityKind, rules: MeetingRules = DEFAULT_MEETING_RULES): string {
  const threshold = rules.majorities[kind];
  const base = threshold.base === 'total' ? 'від загальної кількості голосуючих акцій' : 'голосів зареєстрованих акціонерів';
  return `${thresholdText(threshold)} ${base}`;
}

function thresholdStep(base: number, threshold: Threshold, required: number, subject: string): string {
  const exact = (base * threshold.numerator) / threshold.denominator;
  const rule = threshold.strict ? `«більше» → найменше ціле, більше за ${num(exact)}` : `«не менше» → найменше ціле, не менше за ${num(exact)}`;
  return `${subject}: ${num(base)} × ${threshold.numerator}/${threshold.denominator} = ${num(exact)}; ${rule}: ${num(required)}.`;
}

export function quorumSteps(input: QuorumInput, result: QuorumResult, rules: MeetingRules = DEFAULT_MEETING_RULES): string[] {
  const verdict = result.hasQuorum
    ? `${num(input.registeredShares)} ≥ ${num(result.requiredShares)} → кворум є.`
    : `${num(input.registeredShares)} < ${num(result.requiredShares)} → кворуму немає, бракує ${sharesGenitiveText(result.shortfall)}.`;
  return [
    thresholdStep(input.votingShares, rules.quorum, result.requiredShares, 'Поріг кворуму'),
    `Зареєстровано: ${num(input.registeredShares)}, це ${percent(result.registeredShare)} голосуючих акцій.`,
    verdict,
  ];
}

export function resolutionSteps(input: ResolutionInput, result: ResolutionResult, hasQuorum: boolean): string[] {
  const baseText = result.threshold.base === 'total' ? 'загальна кількість голосуючих акцій' : 'зареєстровані голосуючі акції';
  const comparison = input.votesFor >= result.requiredVotes ? '≥' : '<';
  const outcome = result.adopted ? 'рішення прийнято' : 'рішення не прийнято';
  const steps = [
    `База — ${baseText}: ${num(result.base)}.`,
    thresholdStep(result.base, result.threshold, result.requiredVotes, 'Поріг'),
    `Голосів «за» ${num(input.votesFor)} (${percent(result.shareOfBase)} бази) ${comparison} ${num(result.requiredVotes)} → ${outcome}.`,
  ];
  return hasQuorum ? steps : [...steps, 'Але кворуму немає: збори неправомочні, і рішення не приймаються за будь-якої кількості голосів.'];
}

export interface QuorumForm {
  readonly votingShares: string;
  readonly registeredShares: string;
  readonly votesFor: string;
  readonly majority: MajorityKind;
}

export interface QuorumCalculation {
  readonly quorum: QuorumResult;
  readonly resolution: ResolutionResult;
  readonly quorumSteps: readonly string[];
  readonly resolutionSteps: readonly string[];
}

export function calculateQuorumForm(form: QuorumForm, rules: MeetingRules = DEFAULT_MEETING_RULES): Result<QuorumCalculation, FieldIssues> {
  const parsed = parseFields({ votingShares: form.votingShares, registeredShares: form.registeredShares, votesFor: form.votesFor }, QUORUM_FIELDS);
  if (!parsed.ok) return parsed;
  const quorumInput = { votingShares: parsed.value.votingShares, registeredShares: parsed.value.registeredShares };
  const quorum = calculateQuorum(quorumInput, rules);
  if (!quorum.ok) return err([issueFromCalc(quorum.error)]);
  const resolutionInput = { ...quorumInput, votesFor: parsed.value.votesFor, majority: form.majority };
  const resolution = decideResolution(resolutionInput, rules);
  if (!resolution.ok) return err([issueFromCalc(resolution.error)]);
  return ok({
    quorum: quorum.value,
    resolution: resolution.value,
    quorumSteps: quorumSteps(quorumInput, quorum.value, rules),
    resolutionSteps: resolutionSteps(resolutionInput, resolution.value, quorum.value.hasQuorum),
  });
}

export interface QuorumVariant {
  readonly variantId: string;
  readonly input: QuorumInput;
  readonly majority: MajorityKind;
  readonly quorum: QuorumResult;
  readonly resolution: ResolutionResult;
}

/** Варіант: пакет і реєстрація — з генератора рушія, питання порядку денного — з того самого джерела випадковості. */
export function createQuorumVariant(random: RandomSource, rules: MeetingRules = DEFAULT_MEETING_RULES): QuorumVariant {
  const task = generateQuorumTask(random);
  const majority = pickOne(MAJORITY_KINDS, random);
  const quorum = expectValid(calculateQuorum(task.input, rules));
  const resolution = expectValid(decideResolution({ ...task.input, votesFor: 0, majority }, rules));
  return { variantId: `${task.variantId}-${majority}`, input: task.input, majority, quorum, resolution };
}

export interface QuorumAnswer {
  readonly hasQuorum: YesNo;
  readonly requiredShares: string;
  readonly requiredVotes: string;
}

export const QUORUM_TASK_LABELS = {
  hasQuorum: 'Чи мають збори кворум?',
  requiredShares: 'Мінімум зареєстрованих акцій для кворуму',
  requiredVotes: 'Мінімум голосів «за» для рішення',
} as const;

export function checkQuorumAnswer(variant: QuorumVariant, answer: QuorumAnswer): Result<TaskCheck, FieldIssues> {
  return combineParts([
    checkChoicePart({ id: 'hasQuorum', label: QUORUM_TASK_LABELS.hasQuorum, value: answer.hasQuorum, expected: variant.quorum.hasQuorum, yes: 'так', no: 'ні' }),
    checkNumberPart({ id: 'requiredShares', label: QUORUM_TASK_LABELS.requiredShares, text: answer.requiredShares, expected: variant.quorum.requiredShares, tolerance: 0, format: num }),
    checkNumberPart({ id: 'requiredVotes', label: QUORUM_TASK_LABELS.requiredVotes, text: answer.requiredVotes, expected: variant.resolution.requiredVotes, tolerance: 0, format: num }),
  ]);
}

/** Повний розбір варіанта: кворум і поріг рішення (без голосів «за» — їх у задачі немає). */
export function quorumSolution(variant: QuorumVariant, rules: MeetingRules = DEFAULT_MEETING_RULES): string[] {
  const baseText = variant.resolution.threshold.base === 'total' ? 'загальна кількість голосуючих акцій' : 'зареєстровані голосуючі акції';
  return [
    ...quorumSteps(variant.input, variant.quorum, rules),
    `Рішення про ${MAJORITY_ISSUES[variant.majority]}: ${majorityLabel(variant.majority, rules)}; база — ${baseText}: ${num(variant.resolution.base)}.`,
    thresholdStep(variant.resolution.base, variant.resolution.threshold, variant.resolution.requiredVotes, 'Поріг рішення'),
  ];
}
