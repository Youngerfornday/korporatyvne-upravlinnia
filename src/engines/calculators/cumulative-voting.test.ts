import { describe, expect, it } from 'vitest';
import { CUMULATIVE_CASES, GUARANTEED_SEATS_CASES } from './__fixtures__/reference-cases';
import { cumulativeVotes, guaranteedSeats, minimumStakeForSeats } from './cumulative-voting';

describe('cumulativeVotes', () => {
  it('multiplies shares by seats', () => {
    expect(cumulativeVotes({ shares: 1_500, seats: 7 })).toEqual({ ok: true, value: 10_500 });
  });

  it('validates inputs', () => {
    expect(cumulativeVotes({ shares: -1, seats: 7 })).toMatchObject({ ok: false, error: { code: 'negative' } });
    expect(cumulativeVotes({ shares: 10, seats: 0 })).toMatchObject({ ok: false, error: { code: 'not-positive' } });
  });
});

describe('minimumStakeForSeats — reference cases', () => {
  it.each(CUMULATIVE_CASES)('$id', ({ input, expected }) => {
    const result = minimumStakeForSeats(input);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toMatchObject(expected);
  });

  it('guarantees exactly k seats: the minimum stake gives k seats, one share less does not', () => {
    for (const { input } of CUMULATIVE_CASES) {
      const result = minimumStakeForSeats(input);
      if (!result.ok) throw new Error(result.error.message);
      const { minimumShares } = result.value;
      expect(guaranteedSeats({ votingShares: input.votingShares, seats: input.seats, stake: minimumShares })).toEqual({ ok: true, value: input.targetSeats });
      expect(guaranteedSeats({ votingShares: input.votingShares, seats: input.seats, stake: minimumShares - 1 })).toEqual({ ok: true, value: input.targetSeats - 1 });
    }
  });

  it('reports the share of votes of the minimum stake', () => {
    const result = minimumStakeForSeats({ votingShares: 600, seats: 5, targetSeats: 1 });
    expect(result.ok && result.value.shareOfVotes).toBeCloseTo(101 / 600, 12);
  });

  it.each([
    [{ votingShares: 600, seats: 5, targetSeats: 0 }, 'out-of-range', 'targetSeats'],
    [{ votingShares: 600, seats: 5, targetSeats: 6 }, 'out-of-range', 'targetSeats'],
    [{ votingShares: 600, seats: 2.5, targetSeats: 1 }, 'not-integer', 'seats'],
    [{ votingShares: 0, seats: 5, targetSeats: 1 }, 'not-positive', 'votingShares'],
  ])('%o → %s in %s', (input, code, field) => {
    expect(minimumStakeForSeats(input)).toMatchObject({ ok: false, error: { code, field } });
  });
});

describe('guaranteedSeats — reference cases', () => {
  it.each(GUARANTEED_SEATS_CASES)('$id', ({ input, expected }) => {
    expect(guaranteedSeats(input)).toEqual({ ok: true, value: expected.seats });
  });

  it('caps at the number of seats and rejects a stake above all shares', () => {
    expect(guaranteedSeats({ votingShares: 600, seats: 5, stake: 600 })).toEqual({ ok: true, value: 5 });
    expect(guaranteedSeats({ votingShares: 600, seats: 5, stake: 0 })).toEqual({ ok: true, value: 0 });
    expect(guaranteedSeats({ votingShares: 600, seats: 5, stake: 601 })).toMatchObject({ ok: false, error: { code: 'inconsistent' } });
  });
});
