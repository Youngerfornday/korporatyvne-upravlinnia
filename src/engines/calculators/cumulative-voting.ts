import { formatNumber } from '../shared/number-format';
import { err, ok } from '../shared/result';
import { calcError, firstError, nonNegativeInteger, positiveInteger, type CalcResult, type FieldSpec } from './validation';

/**
 * Кумулятивне голосування (ст. 53 ч. 5 Закону № 2465-IX, legal-baseline AT-39): кількість голосів
 * акціонера = акції × кількість місць; голоси можна віддати одному кандидату або розподілити.
 * Формулу мінімального пакета закон не встановлює — це математичне правило (legal-baseline,
 * «Не підтверджено», п. 13): щоб гарантовано провести k з N кандидатів при S акціях, що голосують,
 * пакет має бути строго більшим за S·k/(N+1), тобто floor(S·k/(N+1)) + 1. Рівність не гарантує
 * місця: суперник може зрівнятися, а за рівності, що не дає визначити склад, орган не сформовано.
 */
const FIELDS = {
  shares: { field: 'shares', label: 'Кількість акцій' },
  seats: { field: 'seats', label: 'Кількість місць' },
  votingShares: { field: 'votingShares', label: 'Акції, що голосують' },
  targetSeats: { field: 'targetSeats', label: 'Місця, які треба гарантувати' },
  stake: { field: 'stake', label: 'Пакет акцій' },
} as const satisfies Record<string, FieldSpec>;

export function cumulativeVotes(input: { readonly shares: number; readonly seats: number }): CalcResult<number> {
  const problem = firstError(nonNegativeInteger(input.shares, FIELDS.shares), positiveInteger(input.seats, FIELDS.seats));
  return problem ? err(problem) : ok(input.shares * input.seats);
}

export interface MinimumStakeInput {
  readonly votingShares: number;
  readonly seats: number;
  readonly targetSeats: number;
}

export interface MinimumStakeResult {
  readonly minimumShares: number;
  readonly cumulativeVotes: number;
  readonly shareOfVotes: number;
}

export function minimumStakeForSeats(input: MinimumStakeInput): CalcResult<MinimumStakeResult> {
  const problem =
    firstError(
      positiveInteger(input.votingShares, FIELDS.votingShares),
      positiveInteger(input.seats, FIELDS.seats),
      nonNegativeInteger(input.targetSeats, FIELDS.targetSeats),
    ) ??
    (input.targetSeats < 1 || input.targetSeats > input.seats
      ? calcError('out-of-range', FIELDS.targetSeats, `Кількість місць, які треба гарантувати, має бути від 1 до ${input.seats}.`)
      : null);
  if (problem) return err(problem);

  const minimumShares = Math.floor((input.votingShares * input.targetSeats) / (input.seats + 1)) + 1;
  return ok({ minimumShares, cumulativeVotes: minimumShares * input.seats, shareOfVotes: minimumShares / input.votingShares });
}

export interface GuaranteedSeatsInput {
  readonly votingShares: number;
  readonly seats: number;
  readonly stake: number;
}

/** Обернена задача: найбільше k ≤ N, для якого stake > S·k/(N+1), тобто k·S < stake·(N+1). */
export function guaranteedSeats(input: GuaranteedSeatsInput): CalcResult<number> {
  const problem =
    firstError(
      positiveInteger(input.votingShares, FIELDS.votingShares),
      positiveInteger(input.seats, FIELDS.seats),
      nonNegativeInteger(input.stake, FIELDS.stake),
    ) ??
    (input.stake > input.votingShares
      ? calcError('inconsistent', FIELDS.stake, `Пакет не може бути більшим за ${formatNumber(input.votingShares)} акцій, що голосують.`)
      : null);
  if (problem) return err(problem);
  if (input.stake === 0) return ok(0);
  return ok(Math.min(input.seats, Math.floor((input.stake * (input.seats + 1) - 1) / input.votingShares)));
}
