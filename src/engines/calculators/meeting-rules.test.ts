import { describe, expect, it } from 'vitest';
import { LEGACY_514_VI_RULES, LEGACY_QUORUM_CASE, QUORUM_CASES, RESOLUTION_CASES } from './__fixtures__/reference-cases';
import { DEFAULT_MEETING_RULES, calculateQuorum, decideResolution, minimumAbove } from './meeting-rules';

describe('DEFAULT_MEETING_RULES (Закон № 2465-IX, legal-baseline AT-26, AT-38, AT-62)', () => {
  it('matches the verified norms', () => {
    expect(DEFAULT_MEETING_RULES.quorum).toEqual({ numerator: 1, denominator: 2, strict: true });
    expect(DEFAULT_MEETING_RULES.majorities).toEqual({
      simple: { numerator: 1, denominator: 2, strict: true, base: 'registered' },
      qualified: { numerator: 3, denominator: 4, strict: true, base: 'registered' },
      'preemptive-waiver': { numerator: 95, denominator: 100, strict: true, base: 'registered' },
      'significant-transaction-50': { numerator: 1, denominator: 2, strict: true, base: 'total' },
    });
  });
});

describe('minimumAbove', () => {
  it('uses exact integer arithmetic for strict and non-strict thresholds', () => {
    expect(minimumAbove(10_000, { numerator: 1, denominator: 2, strict: true })).toBe(5_001);
    expect(minimumAbove(10_001, { numerator: 1, denominator: 2, strict: true })).toBe(5_001);
    expect(minimumAbove(20, { numerator: 95, denominator: 100, strict: true })).toBe(20);
    expect(minimumAbove(1_200_000, { numerator: 3, denominator: 5, strict: false })).toBe(720_000);
    expect(minimumAbove(7, { numerator: 3, denominator: 5, strict: false })).toBe(5);
    expect(minimumAbove(0, { numerator: 1, denominator: 2, strict: true })).toBe(1);
  });
});

describe('calculateQuorum — reference cases', () => {
  it.each(QUORUM_CASES)('$id', ({ input, expected }) => {
    const result = calculateQuorum(input);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toMatchObject(expected);
  });

  it('takes thresholds from configuration, not from code', () => {
    const result = calculateQuorum(LEGACY_QUORUM_CASE.input, { ...DEFAULT_MEETING_RULES, ...LEGACY_514_VI_RULES });
    expect(result.ok && result.value).toMatchObject(LEGACY_QUORUM_CASE.expected);
  });
});

describe('calculateQuorum — validation', () => {
  it.each([
    [{ votingShares: 0, registeredShares: 0 }, 'not-positive'],
    [{ votingShares: 10.5, registeredShares: 1 }, 'not-integer'],
    [{ votingShares: 100, registeredShares: -1 }, 'negative'],
    [{ votingShares: 100, registeredShares: 101 }, 'inconsistent'],
  ])('%o → %s', (input, code) => {
    expect(calculateQuorum(input)).toMatchObject({ ok: false, error: { code } });
  });

  it('rejects an invalid threshold configuration', () => {
    const rules = { ...DEFAULT_MEETING_RULES, quorum: { numerator: 3, denominator: 0, strict: true } };
    expect(calculateQuorum({ votingShares: 100, registeredShares: 60 }, rules)).toMatchObject({ ok: false, error: { code: 'inconsistent' } });
  });
});

describe('decideResolution — reference cases', () => {
  it.each(RESOLUTION_CASES)('$id', ({ input, expected }) => {
    const result = decideResolution(input);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toMatchObject(expected);
  });

  it('reports the share of the base that voted for', () => {
    const result = decideResolution({ votingShares: 10_000, registeredShares: 8_000, votesFor: 6_001, majority: 'qualified' });
    expect(result.ok && result.value.shareOfBase).toBeCloseTo(0.750125, 12);
  });
});

describe('decideResolution — validation', () => {
  it('rejects more votes than registered shares and unknown majority kinds', () => {
    expect(decideResolution({ votingShares: 100, registeredShares: 50, votesFor: 51, majority: 'simple' })).toMatchObject({
      ok: false,
      error: { code: 'inconsistent', field: 'votesFor' },
    });
    expect(
      decideResolution({ votingShares: 100, registeredShares: 50, votesFor: 1, majority: 'unanimous' as 'simple' }),
    ).toMatchObject({ ok: false, error: { code: 'inconsistent', field: 'majority' } });
  });
});
