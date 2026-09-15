import { DEFAULT_MEETING_RULES, decideResolution, type MeetingRules, type ResolutionResult } from '../../calculators/meeting-rules';
import type { CalcResult } from '../../calculators/validation';
import { formatNumber } from '../../shared/number-format';
import { ok } from '../../shared/result';
import type { Candidate, ElectionItem, Registration, ResolutionItem } from './types';

export interface ResolutionTally {
  readonly itemId: string;
  readonly votesFor: number;
  readonly votesAgainst: number;
  readonly abstained: number;
  /** Зареєстровані акції, власники яких не віддали бюлетень, — як і утримання, не є голосами «за». */
  readonly notVoted: number;
  /** Акціонери, що голосували без реєстрації, — їхні голоси не рахуються. */
  readonly ignored: readonly string[];
  readonly decision: ResolutionResult;
}

function registeredShares(registration: Registration): ReadonlyMap<string, number> {
  return new Map(registration.entries.filter((entry) => entry.status === 'registered').map((entry) => [entry.shareholderId, entry.shares]));
}

export function tallyResolution(item: ResolutionItem, registration: Registration, rules: MeetingRules = DEFAULT_MEETING_RULES): CalcResult<ResolutionTally> {
  const registered = registeredShares(registration);
  const counted = item.votes.filter((vote) => registered.has(vote.shareholderId));
  const sum = (choice: string) => counted.filter((vote) => vote.choice === choice).reduce((acc, vote) => acc + (registered.get(vote.shareholderId) ?? 0), 0);
  const votesFor = sum('for');
  const votesAgainst = sum('against');
  const abstained = sum('abstain');
  const decision = decideResolution(
    { votingShares: registration.votingShares, registeredShares: registration.registeredShares, votesFor, majority: item.majority },
    rules,
  );
  if (!decision.ok) return decision;
  return ok({
    itemId: item.id,
    votesFor,
    votesAgainst,
    abstained,
    notVoted: registration.registeredShares - votesFor - votesAgainst - abstained,
    ignored: item.votes.filter((vote) => !registered.has(vote.shareholderId)).map((vote) => vote.shareholderId),
    decision: decision.value,
  });
}

export interface CandidateTally extends Candidate {
  readonly votes: number;
  readonly elected: boolean;
}

export interface ElectionResult {
  readonly itemId: string;
  readonly seats: number;
  /** За спаданням голосів; за рівності — у порядку списку кандидатів. */
  readonly candidates: readonly CandidateTally[];
  readonly elected: readonly string[];
  readonly formed: boolean;
  readonly reason: string | null;
  readonly invalidBallots: readonly { readonly shareholderId: string; readonly reason: string }[];
  readonly ignored: readonly string[];
}

function ballotProblem(allocation: Readonly<Record<string, number>>, candidates: ReadonlySet<string>, entitlement: number): string | null {
  const entries = Object.entries(allocation);
  if (entries.some(([candidate]) => !candidates.has(candidate))) return 'Бюлетень недійсний: у ньому є кандидат, якого немає в списку.';
  if (entries.some(([, votes]) => !Number.isInteger(votes) || votes < 0)) return 'Бюлетень недійсний: кількість голосів має бути цілим невід’ємним числом.';
  const total = entries.reduce((acc, [, votes]) => acc + votes, 0);
  if (total > entitlement) {
    return `Бюлетень недійсний: віддано ${formatNumber(total)} голосів при праві на ${formatNumber(entitlement)} (ст. 54 ч. 6 Закону № 2465-IX).`;
  }
  return null;
}

/**
 * Кумулятивне обрання (ст. 53 ч. 5, ст. 54 ч. 6 Закону № 2465-IX): голоси = акції × місця; обрано тих, хто
 * набрав найбільше голосів; орган сформовано лише в повному складі; рівність на межі — не сформовано.
 * Кандидат без жодного голосу не вважається обраним (припущення симуляції).
 */
export function electBoard(item: ElectionItem, registration: Registration): ElectionResult {
  const registered = registeredShares(registration);
  const candidateIds = new Set(item.candidates.map((candidate) => candidate.id));
  const invalidBallots: { shareholderId: string; reason: string }[] = [];
  const totals = new Map(item.candidates.map((candidate) => [candidate.id, 0]));

  for (const ballot of item.ballots) {
    const shares = registered.get(ballot.shareholderId);
    if (shares === undefined) continue;
    const problem = ballotProblem(ballot.allocation, candidateIds, shares * item.seats);
    if (problem) {
      invalidBallots.push({ shareholderId: ballot.shareholderId, reason: problem });
      continue;
    }
    for (const [candidate, votes] of Object.entries(ballot.allocation)) totals.set(candidate, (totals.get(candidate) ?? 0) + votes);
  }

  const ranked = item.candidates
    .map((candidate, index) => ({ candidate, index, votes: totals.get(candidate.id) ?? 0 }))
    .sort((a, b) => b.votes - a.votes || a.index - b.index);
  const withVotes = ranked.filter((entry) => entry.votes > 0).length;
  const lastSeat = ranked[item.seats - 1];
  const firstLoser = ranked[item.seats];
  const tie = lastSeat !== undefined && firstLoser !== undefined && lastSeat.votes === firstLoser.votes;
  const reason =
    withVotes < item.seats
      ? 'Раду не сформовано: кандидатів, що отримали голоси, менше, ніж місць.'
      : tie
        ? 'Раду не сформовано: рівна кількість голосів не дає визначити склад (ст. 53 ч. 5 Закону № 2465-IX).'
        : null;
  const formed = reason === null;

  return {
    itemId: item.id,
    seats: item.seats,
    candidates: ranked.map((entry, position) => ({ ...entry.candidate, votes: entry.votes, elected: formed && position < item.seats })),
    elected: formed ? ranked.slice(0, item.seats).map((entry) => entry.candidate.id) : [],
    formed,
    reason,
    invalidBallots,
    ignored: item.ballots.filter((ballot) => !registered.has(ballot.shareholderId)).map((ballot) => ballot.shareholderId),
  };
}
