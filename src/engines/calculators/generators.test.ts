import { describe, expect, it } from 'vitest';
import { createSeededRandom } from '../shared/random';
import { generateBondTask, generateCumulativeTask, generateDividendTask, generateDupontTask, generateQuorumTask } from './generators';

const SEEDS = Array.from({ length: 40 }, (_, index) => `seed-${index}`);
const VARIANT_ID = /^[a-z0-9]+(?:[-_][a-z0-9]+)*$/;

function hasAtMostDecimals(value: number, decimals: number): boolean {
  const scaled = value * 10 ** decimals;
  return Math.abs(scaled - Math.round(scaled)) < 1e-6;
}

describe('task generators', () => {
  it('are deterministic for a seed', () => {
    expect(generateQuorumTask(createSeededRandom('x'))).toEqual(generateQuorumTask(createSeededRandom('x')));
    expect(generateDividendTask(createSeededRandom('x'))).toEqual(generateDividendTask(createSeededRandom('x')));
  });

  it('quorum: round share counts, both outcomes occur, answer from the calculator', () => {
    const tasks = SEEDS.map((seed) => generateQuorumTask(createSeededRandom(seed)));
    for (const task of tasks) {
      expect(task.variantId).toMatch(VARIANT_ID);
      expect(task.input.votingShares % 100).toBe(0);
      expect(Number.isInteger(task.input.registeredShares)).toBe(true);
      expect(task.answer.requiredShares).toBe(Math.floor(task.input.votingShares / 2) + 1);
    }
    expect(new Set(tasks.map((task) => task.answer.hasQuorum)).size).toBe(2);
    expect(new Set(tasks.map((task) => task.variantId)).size).toBeGreaterThan(20);
  });

  it('cumulative voting: S·k/(N+1) is a whole number, so the answer is a round number plus one', () => {
    for (const seed of SEEDS) {
      const task = generateCumulativeTask(createSeededRandom(seed));
      const { votingShares, seats, targetSeats } = task.input;
      expect((votingShares * targetSeats) % (seats + 1)).toBe(0);
      expect(targetSeats).toBeLessThanOrEqual(seats);
      expect(task.answer.minimumShares).toBe((votingShares * targetSeats) / (seats + 1) + 1);
    }
  });

  it('dividends: money amounts in whole kopiyky and a positive dividend per share', () => {
    for (const seed of SEEDS) {
      const { input, answer, variantId } = generateDividendTask(createSeededRandom(seed));
      expect(variantId).toMatch(VARIANT_ID);
      expect(input.netProfit % 1_000_000).toBe(0);
      for (const amount of [answer.reserve, answer.preferredDividends, answer.commonPool, answer.retainedEarnings]) {
        expect(hasAtMostDecimals(amount, 2)).toBe(true);
      }
      expect(answer.commonPerShare).toBeGreaterThan(0);
      expect(hasAtMostDecimals(answer.commonPerShare, 2)).toBe(true);
      expect(answer.preferredShortfall).toBe(0);
    }
  });

  it('DuPont: ratios with few decimals that satisfy the identities', () => {
    for (const seed of SEEDS) {
      const { input, answer } = generateDupontTask(createSeededRandom(seed));
      expect(hasAtMostDecimals(answer.returnOnSales, 2)).toBe(true);
      expect(hasAtMostDecimals(answer.assetTurnover, 2)).toBe(true);
      expect(hasAtMostDecimals(answer.equityMultiplier, 2)).toBe(true);
      expect(answer.returnOnEquity).toBeCloseTo(input.netIncome / input.averageEquity, 12);
    }
  });

  it('bonds: whole-percent rates and a price consistent with the yield', () => {
    for (const seed of SEEDS) {
      const { input, answer } = generateBondTask(createSeededRandom(seed));
      expect(hasAtMostDecimals(input.couponRate * 100, 0)).toBe(true);
      expect(hasAtMostDecimals(input.marketRate * 100, 0)).toBe(true);
      expect(answer.price).toBeGreaterThan(0);
      expect(answer.currentYield).toBeCloseTo((input.faceValue * input.couponRate) / answer.price, 12);
    }
  });
});
