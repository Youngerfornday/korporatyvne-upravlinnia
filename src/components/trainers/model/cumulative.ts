/**
 * Тренажер «Кумулятивне голосування»: мінімальний пакет для k з N місць (S·k/(N+1), округлення вниз, +1),
 * обернена перевірка «чи пройдуть усі k кандидатів акціонера з пакетом» і задача з варіантом.
 */
import {
  expectValid,
  generateCumulativeTask,
  guaranteedSeats,
  minimumStakeForSeats,
  type MinimumStakeInput,
  type MinimumStakeResult,
} from '../../../engines/calculators';
import { pickOne, type RandomSource } from '../../../engines/shared/random';
import { err, ok, type Result } from '../../../engines/shared/result';
import { num, percent, seatsText, sharesText } from './format';
import { checkChoicePart, checkNumberPart, combineParts, issueFromCalc, parseFields, type FieldIssues, type TaskCheck, type YesNo } from './task-check';

const FIELDS = {
  votingShares: { field: 'votingShares', label: 'Акції, що голосують' },
  seats: { field: 'seats', label: 'Кількість місць' },
  targetSeats: { field: 'targetSeats', label: 'Місця, які треба гарантувати' },
  stake: { field: 'stake', label: 'Пакет акцій' },
} as const;

export function minimumStakeSteps(input: MinimumStakeInput, result: MinimumStakeResult): string[] {
  const quotient = (input.votingShares * input.targetSeats) / (input.seats + 1);
  return [
    `S·k / (N + 1) = ${num(input.votingShares)} × ${num(input.targetSeats)} / ${num(input.seats + 1)} = ${num(quotient)}.`,
    `Пакет має бути строго більшим: floor(${num(quotient)}) + 1 = ${sharesText(result.minimumShares)} (${percent(result.shareOfVotes)} акцій, що голосують).`,
    `Кумулятивних голосів у пакеті: ${num(result.minimumShares)} × ${num(input.seats)} = ${num(result.cumulativeVotes)}.`,
  ];
}

function seatCheckLine(votingShares: number, seats: number, stake: number, k: number): string {
  const quota = (votingShares * k) / (seats + 1);
  const guaranteed = stake > quota;
  return `Для k = ${k}: ${num(votingShares)} × ${k} / ${num(seats + 1)} = ${num(quota)} ${guaranteed ? '<' : '≥'} ${num(stake)} → ${guaranteed ? 'гарантовано' : 'не гарантовано'}.`;
}

/** Перевірка k і k + 1 навколо відповіді та висновок для кандидатів акціонера. */
export function guaranteedSeatsSteps(votingShares: number, seats: number, stake: number, guaranteed: number, candidates: number): string[] {
  const checks = [guaranteed, guaranteed + 1].filter((k) => k >= 1 && k <= seats).map((k) => seatCheckLine(votingShares, seats, stake, k));
  const verdict =
    guaranteed >= candidates
      ? `Пакет гарантує ${seatsText(guaranteed)}; ${candidates} ≤ ${guaranteed} → усі кандидати акціонера пройдуть, якщо розподілити голоси порівну між ними.`
      : `Пакет гарантує ${seatsText(guaranteed)}; ${candidates} > ${guaranteed} → гарантії, що пройдуть усі кандидати, немає.`;
  return [`Голосів пакета: ${num(stake)} × ${num(seats)} = ${num(stake * seats)}.`, ...checks, verdict];
}

export interface CumulativeForm {
  readonly votingShares: string;
  readonly seats: string;
  readonly targetSeats: string;
  /** Порожньо — перевірку «чи пройде кандидат» пропущено. */
  readonly stake: string;
}

export interface CumulativeCalculation {
  readonly input: MinimumStakeInput;
  readonly minimum: MinimumStakeResult;
  readonly stake: number | null;
  readonly guaranteed: number | null;
  readonly candidatesPass: boolean | null;
  readonly minimumSteps: readonly string[];
  readonly guaranteedSteps: readonly string[];
}

export function calculateCumulativeForm(form: CumulativeForm): Result<CumulativeCalculation, FieldIssues> {
  const withStake = form.stake.trim() !== '';
  const parsed = parseFields(
    { votingShares: form.votingShares, seats: form.seats, targetSeats: form.targetSeats, stake: withStake ? form.stake : '0' },
    FIELDS,
  );
  if (!parsed.ok) return parsed;
  const input = { votingShares: parsed.value.votingShares, seats: parsed.value.seats, targetSeats: parsed.value.targetSeats };
  const minimum = minimumStakeForSeats(input);
  if (!minimum.ok) return err([issueFromCalc(minimum.error)]);
  const base = { input, minimum: minimum.value, minimumSteps: minimumStakeSteps(input, minimum.value) };
  if (!withStake) return ok({ ...base, stake: null, guaranteed: null, candidatesPass: null, guaranteedSteps: [] });

  const stake = parsed.value.stake;
  const guaranteed = guaranteedSeats({ votingShares: input.votingShares, seats: input.seats, stake });
  if (!guaranteed.ok) return err([issueFromCalc(guaranteed.error)]);
  return ok({
    ...base,
    stake,
    guaranteed: guaranteed.value,
    candidatesPass: guaranteed.value >= input.targetSeats,
    guaranteedSteps: guaranteedSeatsSteps(input.votingShares, input.seats, stake, guaranteed.value, input.targetSeats),
  });
}

export interface CumulativeVariant {
  readonly variantId: string;
  readonly input: MinimumStakeInput;
  readonly minimum: MinimumStakeResult;
  /** Пакет акціонера, для якого питаємо, чи пройдуть усі його k кандидатів. */
  readonly stake: number;
  readonly guaranteed: number;
  readonly passes: boolean;
}

export function createCumulativeVariant(random: RandomSource): CumulativeVariant {
  const task = generateCumulativeTask(random);
  const { votingShares, seats, targetSeats } = task.input;
  const quota = votingShares / (seats + 1);
  // Навколо межі: рівно квота × k (не гарантує), на акцію більше (гарантує) або з запасом у пів квоти.
  const stake = pickOne([task.answer.minimumShares - 1, task.answer.minimumShares, task.answer.minimumShares + Math.floor(quota / 2)], random);
  const guaranteed = expectValid(guaranteedSeats({ votingShares, seats, stake }));
  return { variantId: `${task.variantId}-${stake}`, input: task.input, minimum: task.answer, stake, guaranteed, passes: guaranteed >= targetSeats };
}

export interface CumulativeAnswer {
  readonly minimumShares: string;
  readonly passes: YesNo;
}

export const CUMULATIVE_TASK_LABELS = {
  minimumShares: 'Мінімальний пакет, акцій',
  passes: 'Чи гарантовано пройдуть усі кандидати акціонера?',
} as const;

export function checkCumulativeAnswer(variant: CumulativeVariant, answer: CumulativeAnswer): Result<TaskCheck, FieldIssues> {
  return combineParts([
    checkNumberPart({ id: 'minimumShares', label: CUMULATIVE_TASK_LABELS.minimumShares, text: answer.minimumShares, expected: variant.minimum.minimumShares, tolerance: 0, format: num }),
    checkChoicePart({ id: 'passes', label: CUMULATIVE_TASK_LABELS.passes, value: answer.passes, expected: variant.passes, yes: 'так', no: 'ні' }),
  ]);
}

export function cumulativeSolution(variant: CumulativeVariant): string[] {
  const { votingShares, seats, targetSeats } = variant.input;
  return [...minimumStakeSteps(variant.input, variant.minimum), ...guaranteedSeatsSteps(votingShares, seats, variant.stake, variant.guaranteed, targetSeats)];
}
